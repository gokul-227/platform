import { z } from "zod";
import { scopeQueryRefinement, scopeQueryShape } from "../../common/scope";
import { listInputSchema, listResponseSchema } from "../../query";
import { ownerGroupSchema } from "../../tenancy/groups/group.schemas";
// The canonical list is composed from the type manifests, so this one import
// points up a layer. Description text only: it creates no cycle.
import { CANONICAL_EDGE_TYPES } from "../vocabulary";
import { graphEdgeList } from "./edge.filters";
import {
  propertiesSchema,
  propertyKeysSchema,
  selectProjectionSchema,
} from "./property";
import { scopeFilterSchema } from "./scope";

const edgeTypeSchema = z
  .string()
  .min(1)
  .max(64)
  .describe(
    `Relation type. Canonical values: ${CANONICAL_EDGE_TYPES.join(", ")} ` +
      "(spatial hierarchy, rule binding, bounding element, adjacency, supply). " +
      "Project-specific types (e.g. `hasOwner`, `suppliedBy`) are accepted; they're logged " +
      "as experimental for vocabulary drift observability."
  );

export const graphEdgeResponseSchema = z
  .object({
    id: z.string().uuid().describe("Stable edge id."),
    orgId: z
      .string()
      .uuid()
      .describe("Parent organization id. Always present."),
    projectId: z
      .string()
      .uuid()
      .nullable()
      .describe(
        "Owning project id. `null` for org-scoped edges; non-null for project-scoped. " +
          "Derived as the strictest of the two endpoints' scopes (a project-to-org bind lives at project scope). " +
          "Scope is fully derivable from this field — no separate `scope` discriminator on the response."
      ),
    sourceId: z
      .string()
      .uuid()
      .describe("Source node id. Immutable after creation."),
    targetId: z
      .string()
      .uuid()
      .describe("Target node id. Immutable after creation."),
    type: edgeTypeSchema,
    version: z
      .string()
      .describe(
        "Server-assigned monotonic version, bumped on every write that changes content. Every bump appends a `graph_version` row carrying the full post-state, which is what history reads from."
      ),
    properties: propertiesSchema.describe(
      "Property bag for the relation itself. Same projection semantics as nodes."
    ),
    propertyKeys: propertyKeysSchema,
    createdAt: z
      .string()
      .datetime()
      .describe("When the edge was created (ISO 8601)."),
    updatedAt: z
      .string()
      .datetime()
      .describe("When the edge was last changed (ISO 8601)."),
  })
  .describe("A graph edge.");

export const createGraphEdgeInputSchema = z
  .object({
    groupId: ownerGroupSchema,
    sourceId: z
      .string()
      .uuid()
      .describe("Source node id. Must be visible from the target scope."),
    targetId: z
      .string()
      .uuid()
      .describe("Target node id. Must be visible from the target scope."),
    type: edgeTypeSchema,
    properties: propertiesSchema
      .optional()
      .describe("Initial property bag. Defaults to `{}`."),
  })
  .describe(
    "Fields for creating an edge. The edge is anchored to the changeset's collection scope, and the endpoints are validated to be visible from it. " +
      "An org changeset requires both endpoints to be org-scoped nodes in that org; a project changeset also allows the common cross-scope bind (a project endpoint to an org-scoped reference such as a law)."
  );

export const updateGraphEdgeInputSchema = z
  .object({
    type: edgeTypeSchema.optional().describe("Replacement relation type."),
    properties: propertiesSchema
      .optional()
      .describe(
        "Full replacement of the property bag. v1 stores the new state in place; a granular per-block patch endpoint lands with the change-log system."
      ),
  })
  .describe(
    "Body for updating an edge. Endpoints (`sourceId`, `targetId`) are immutable. To rewire, delete and recreate."
  );

// ── Batch op model ───────────────────────────────────────────────────────
// Discriminated union on `op`. `create`/`upsert` carry the full write field
// set; `update` touches `type`/`properties` only (endpoints immutable);
// `delete` carries just an id. The scoped changeset write route
// consumes arrays of these.

const graphEdgeWriteFields = {
  id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Optional client-supplied edge id (e.g. a deterministic uuidv5 from an import namespace + source key). " +
        "Makes re-runs idempotent. Omitted: the server assigns one."
    ),
  sourceId: z
    .string()
    .uuid()
    .describe("Source node id. Must be visible from the target scope."),
  targetId: z
    .string()
    .uuid()
    .describe("Target node id. Must be visible from the target scope."),
  type: edgeTypeSchema,
  properties: propertiesSchema
    .optional()
    .describe("Property bag. Defaults to `{}`."),
};

export const graphEdgeCreateOpSchema = z
  .object({ op: z.literal("create"), ...graphEdgeWriteFields })
  .describe(
    "Insert a new edge. An `id` that already exists (in the target scope, any other scope, or with different " +
      "endpoints) is rejected with `GRAPH_EDGE_BATCH_ID_CONFLICT`."
  );

export const graphEdgeUpsertOpSchema = z
  .object({ op: z.literal("upsert"), ...graphEdgeWriteFields })
  .describe(
    "Create-or-replace by `id`: unchanged content (by hash) is skipped, a changed `type`/`properties` replaces " +
      "the stored state and bumps the version. The idempotent op for importers / re-sync. Endpoints are immutable: " +
      "an upsert whose `id` exists with different endpoints is `GRAPH_EDGE_BATCH_ID_CONFLICT`."
  );

export const graphEdgeUpdateOpSchema = z
  .object({
    op: z.literal("update"),
    id: z
      .string()
      .uuid()
      .describe(
        "Id of the existing edge to update; a miss in scope is `GRAPH_EDGE_NOT_FOUND`."
      ),
    type: edgeTypeSchema.optional(),
    properties: propertiesSchema
      .optional()
      .describe("Full-bag replacement of `properties` when present."),
  })
  .describe(
    "Update an existing edge's `type`/`properties`. Endpoints are immutable; rewire = delete + create."
  );

export const graphEdgeDeleteOpSchema = z
  .object({
    op: z.literal("delete"),
    id: z
      .string()
      .uuid()
      .describe(
        "Id of the edge to delete. A miss in scope is `GRAPH_EDGE_NOT_FOUND`."
      ),
  })
  .describe("Delete an edge by id.");

export const graphEdgeOpSchema = z
  .discriminatedUnion("op", [
    graphEdgeCreateOpSchema,
    graphEdgeUpsertOpSchema,
    graphEdgeUpdateOpSchema,
    graphEdgeDeleteOpSchema,
  ])
  .describe(
    "One edge operation, tagged by `op` (create | upsert | update | delete). The server applies all edge " +
      "writes before edge deletes; in the combined changeset, edge writes run after node writes and edge deletes " +
      "before node deletes."
  );

export const getGraphEdgeQuerySchema = z
  .object({
    select: selectProjectionSchema.optional(),
  })
  .describe(
    "Query for fetching a single edge with optional `?select=` projection."
  );

/** One list, addressed by scope. Same shape as the node list. */
export const graphEdgeListShape = listInputSchema(graphEdgeList)
  .extend({
    select: selectProjectionSchema.optional(),
    scope: scopeFilterSchema.optional(),
    ...scopeQueryShape,
  })
  .describe(
    "Query for listing edges. Name exactly one of `orgId` or `projectId`. A project read hydrates the project's " +
      "own edges with the parent org's shared library; `?scope=project` narrows to project-only, `?scope=org` to " +
      "the inherited library. PostgREST-style `op.value` filters " +
      "(`?type=in.(contains,bounds)`, `?sourceId=eq.<uuid>`, `?properties=hasKey.weight`, `?createdAt=gte.2026-01-01`); " +
      "response projection via `?select=key1&select=key2`."
  );

/**
 * The same list, refined: exactly one scope, and `scope` only where there are
 * two layers to narrow between. A refinement is not a `ZodObject`, so the shape
 * above stays composable for the facades that omit a field from it.
 */
export const graphEdgeListInputSchema = graphEdgeListShape.superRefine(
  (query, ctx) => {
    scopeQueryRefinement(query, ctx);
    if (query.scope && !query.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "`scope` narrows a project read; an org read has nothing to narrow.",
        path: ["scope"],
      });
    }
  }
);

/** @deprecated One schema serves both scopes. */
export const projectGraphEdgeListInputSchema = graphEdgeListShape;

export const graphEdgeListResponseSchema = listResponseSchema(
  graphEdgeList,
  graphEdgeResponseSchema.describe("Page of edges.")
).describe("Paged edge list response.");

export type GraphEdgeResponse = z.infer<typeof graphEdgeResponseSchema>;
export type CreateGraphEdgeInput = z.infer<typeof createGraphEdgeInputSchema>;
export type UpdateGraphEdgeInput = z.infer<typeof updateGraphEdgeInputSchema>;
export type GraphEdgeOp = z.infer<typeof graphEdgeOpSchema>;
export type GetGraphEdgeQuery = z.infer<typeof getGraphEdgeQuerySchema>;
export type GraphEdgeListInput = z.infer<typeof graphEdgeListInputSchema>;
export type ProjectGraphEdgeListInput = z.infer<
  typeof projectGraphEdgeListInputSchema
>;
export type GraphEdgeListResponse = z.infer<typeof graphEdgeListResponseSchema>;
