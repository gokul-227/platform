import { z } from "zod";
import { scopeQueryRefinement, scopeQueryShape } from "../../common/scope";
import { listInputSchema, listResponseSchema } from "../../query";
import { ownerGroupSchema } from "../../tenancy/groups/group.schemas";
import { CANONICAL_NODE_TYPES } from "../registry/node.type";
import { graphNodeList } from "./node.filters";
import {
  propertiesSchema,
  propertyKeysSchema,
  selectProjectionSchema,
} from "./property";
import { scopeFilterSchema } from "./scope";

// ── Identity fields only a node has ────────────────────────────────────────
// Both stay open strings at this layer: the service classifies each write
// against the canonical list and counts drift, and accepts either way.

export const nodeTypeSchema = z
  .string()
  .min(1)
  .max(64)
  .describe(
    `Structural type discriminator. Canonical values: ${CANONICAL_NODE_TYPES.join(", ")}. ` +
      "`object` covers physical or logical things (spaces, elements, buildings, plots); " +
      "`rule` is a normative or project rule that reaches its targets through its selector; " +
      "`source` is an external reference point (law, norm, datasheet, project spec). " +
      "Custom values are accepted; they're logged as experimental for vocabulary drift observability."
  );

/**
 * Allowed values vary by type: objects move brief → design → construction →
 * operation, rules and sources move draft → active → deprecated. The platform
 * does not enforce the per-type sets; that is taxonomy governance, not API.
 */
export const phaseSchema = z
  .string()
  .min(1)
  .max(64)
  .describe(
    "Lifecycle phase. For objects: `brief`, `design`, `construction`, `operation`. " +
      "For rules / sources: `draft`, `active`, `deprecated`. Free-form at this layer."
  );

export const graphNodeResponseSchema = z
  .object({
    id: z.string().uuid().describe("Stable node id."),
    orgId: z
      .string()
      .uuid()
      .describe("Parent organization id. Always present."),
    projectId: z
      .string()
      .uuid()
      .nullable()
      .describe(
        "Owning project id. `null` when the node is org-scoped (the row is in the org's shared library); non-null when project-scoped. When non-null, `orgId` matches the project's parent org (composite FK enforces this). The scope is fully derivable from this field — no separate `scope` discriminator on the response."
      ),
    type: nodeTypeSchema,
    class: z
      .string()
      .describe(
        "Domain class string in dot-notation (for example, `space.circulation`, `element.wall`, `source.law`). " +
          "First segment determines the structural type: `space`, `element`, `building`, `site` map to `object`; " +
          "`rule` maps to `rule`; `reference` maps to `reference`. Extensions append more segments."
      ),
    name: z.string().describe("Display name."),
    version: z
      .string()
      .describe(
        "Server-assigned monotonic version, bumped on every write that changes content. Every bump appends a `graph_version` row carrying the full post-state, which is what history reads from."
      ),
    parentId: z
      .string()
      .uuid()
      .nullable()
      .describe("Parent node id within the same graph; `null` for roots."),
    phase: phaseSchema
      .nullable()
      .describe(
        "Optional lifecycle phase. Stays free-form at the API; taxonomy enforces valid values per type."
      ),
    properties: propertiesSchema.describe(
      "Property bag keyed by data block (envelope, programme, etc). If `?select=` was supplied in the query, only those top-level keys are included; missing keys come back as `null`."
    ),
    propertyKeys: propertyKeysSchema,
    createdAt: z
      .string()
      .datetime()
      .describe("When the node was created (ISO 8601)."),
    updatedAt: z
      .string()
      .datetime()
      .describe("When the node was last changed (ISO 8601)."),
  })
  .describe("A graph node.");

export const createGraphNodeInputSchema = z
  .object({
    groupId: ownerGroupSchema,
    type: nodeTypeSchema,
    class: z
      .string()
      .min(1)
      .max(128)
      .describe(
        "Domain class string in dot-notation. 1 to 128 characters. First segment determines the structural type."
      ),
    name: z
      .string()
      .min(1)
      .max(200)
      .describe("Display name. 1 to 200 characters."),
    parentId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe(
        "Optional parent node id. Must resolve to a node visible from the target scope; cross-project and cross-org parents are rejected."
      ),
    phase: phaseSchema
      .optional()
      .describe(
        "Optional lifecycle phase. See response shape for the canonical sets per type."
      ),
    properties: propertiesSchema
      .optional()
      .describe("Initial property bag. Defaults to `{}`."),
  })
  .describe(
    "Fields for creating a node. The scope comes from the changeset's collection (`POST /orgs/:orgId/graph` or `POST /projects/:projectId/graph`), not from the body."
  );

export const updateGraphNodeInputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Replacement display name."),
    class: z.string().min(1).max(128).optional().describe("Replacement class."),
    parentId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe("Replacement parent. Pass `null` to detach."),
    phase: phaseSchema
      .nullable()
      .optional()
      .describe("Replacement lifecycle phase. Pass `null` to clear."),
    properties: propertiesSchema
      .optional()
      .describe(
        "Full replacement of the property bag. v1 stores the new state in place; a granular per-block patch endpoint lands with the change-log system."
      ),
  })
  .describe(
    "Body for updating a node by full replacement. Scope is fixed by the row."
  );

// ── Batch op model ───────────────────────────────────────────────────────
// Discriminated union on `op`. `create`/`upsert` carry the full write field
// set; `update` carries an id plus optional fields; `delete` carries just an
// id. The scoped changeset route consumes arrays of these.

const graphNodeWriteFields = {
  id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Optional client-supplied node id (e.g. a deterministic uuidv5 from an import namespace + source key). " +
        "Lets edges and child `parentId`s in the same changeset reference this node, and makes re-runs idempotent. " +
        "Omitted: the server assigns one."
    ),
  type: nodeTypeSchema,
  class: z
    .string()
    .min(1)
    .max(128)
    .describe(
      "Domain class string in dot-notation. 1 to 128 characters. First segment determines the structural type."
    ),
  name: z
    .string()
    .min(1)
    .max(200)
    .describe("Display name. 1 to 200 characters."),
  parentId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Optional parent node id. May reference a node created earlier in the same changeset (by its id) " +
        "or any node visible from the target scope."
    ),
  phase: phaseSchema.optional().describe("Optional lifecycle phase."),
  properties: propertiesSchema
    .optional()
    .describe("Property bag. Defaults to `{}`."),
};

export const graphNodeCreateOpSchema = z
  .object({ op: z.literal("create"), ...graphNodeWriteFields })
  .describe(
    "Insert a new node. An `id` that already exists (in the target scope or any other) is rejected with " +
      "`GRAPH_NODE_BATCH_ID_CONFLICT`."
  );

export const graphNodeUpsertOpSchema = z
  .object({ op: z.literal("upsert"), ...graphNodeWriteFields })
  .describe(
    "Create-or-replace by `id`: unchanged content (by hash) is skipped, changed content replaces the stored " +
      "state and bumps the version. The idempotent op for importers / re-sync from an external source of truth."
  );

export const graphNodeUpdateOpSchema = z
  .object({
    op: z.literal("update"),
    id: z
      .string()
      .uuid()
      .describe(
        "Id of the existing node to update; a miss in scope is `GRAPH_NODE_NOT_FOUND`."
      ),
    name: z.string().min(1).max(200).optional(),
    class: z.string().min(1).max(128).optional(),
    parentId: z.string().uuid().nullable().optional(),
    phase: phaseSchema.nullable().optional(),
    properties: propertiesSchema
      .optional()
      .describe("Full-bag replacement of `properties` when present."),
  })
  .describe(
    "Update the given fields of an existing node. `type` is structural and immutable."
  );

export const graphNodeDeleteOpSchema = z
  .object({
    op: z.literal("delete"),
    id: z
      .string()
      .uuid()
      .describe(
        "Id of the node to delete; cascades its edges. A miss in scope is `GRAPH_NODE_NOT_FOUND`."
      ),
  })
  .describe("Delete a node by id.");

export const graphNodeOpSchema = z
  .discriminatedUnion("op", [
    graphNodeCreateOpSchema,
    graphNodeUpsertOpSchema,
    graphNodeUpdateOpSchema,
    graphNodeDeleteOpSchema,
  ])
  .describe(
    "One node operation, tagged by `op` (create | upsert | update | delete). The server applies all node " +
      "writes (create/upsert/update) before any node deletes, regardless of array position; write entries that " +
      "reference each other by id should still precede their dependents."
  );

export const getGraphNodeQuerySchema = z
  .object({
    select: selectProjectionSchema.optional(),
  })
  .describe(
    "Query for fetching a single node with optional `?select=` projection."
  );

/**
 * One list, addressed by scope. `scope` narrows a project read between its own
 * rows and the org library it hydrates, so it means nothing on an org read and
 * is refused there rather than ignored.
 */
export const graphNodeListShape = listInputSchema(graphNodeList)
  .extend({
    select: selectProjectionSchema.optional(),
    scope: scopeFilterSchema.optional(),
    ...scopeQueryShape,
  })
  .describe(
    "Query for listing nodes. Name exactly one of `orgId` or `projectId`. A project read hydrates the project's " +
      "own rows with the parent org's shared library; `?scope=project` narrows to project-only, `?scope=org` to " +
      "the inherited library. PostgREST-style `op.value` filters " +
      "(`?type=in.(object,reference)`, `?class=startsWith.space.`, `?properties=hasKey.envelope`, `?createdAt=gte.2026-01-01`); " +
      "response projection via `?select=key1&select=key2`."
  );

/**
 * The same list, refined: exactly one scope, and `scope` only where there are
 * two layers to narrow between. A refinement is not a `ZodObject`, so the shape
 * above stays composable for the facades that omit a field from it.
 */
export const graphNodeListInputSchema = graphNodeListShape.superRefine(
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
export const projectGraphNodeListInputSchema = graphNodeListShape;

export const graphNodeListResponseSchema = listResponseSchema(
  graphNodeList,
  graphNodeResponseSchema.describe("Page of nodes.")
).describe("Paged node list response.");

export type GraphNodeResponse = z.infer<typeof graphNodeResponseSchema>;
export type CreateGraphNodeInput = z.infer<typeof createGraphNodeInputSchema>;
export type UpdateGraphNodeInput = z.infer<typeof updateGraphNodeInputSchema>;
export type GraphNodeOp = z.infer<typeof graphNodeOpSchema>;
export type GetGraphNodeQuery = z.infer<typeof getGraphNodeQuerySchema>;
export type GraphNodeListInput = z.infer<typeof graphNodeListInputSchema>;
export type ProjectGraphNodeListInput = z.infer<
  typeof projectGraphNodeListInputSchema
>;
export type GraphNodeListResponse = z.infer<typeof graphNodeListResponseSchema>;
