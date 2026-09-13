import { z } from "zod";
import { ownerGroupSchema } from "../../tenancy/groups/group.schemas";

import { graphEdgeOpSchema, graphEdgeResponseSchema } from "./edge.schemas";
import { graphNodeOpSchema, graphNodeResponseSchema } from "./node.schemas";

// Naming: `batch` is the data-shape noun (a batch/changeset of node+edge ops),
// `apply` is the verb the operation is named by in the client layers
// (`client.graph.apply`, `useApplyGraph`, MCP `graph_apply`) and in the
// server's batched-write services. The split is deliberate — the contract names
// the payload, the surfaces name the action.

const MAX_OPS_PER_KIND = 1000;

const graphBatchSummarySchema = z.object({
  created: z
    .number()
    .int()
    .describe("Rows inserted (`create`, plus `upsert`s that were new)."),
  updated: z
    .number()
    .int()
    .describe(
      "Rows whose content was replaced (`update`, plus `upsert`s that changed); version bumped."
    ),
  deleted: z.number().int().describe("Rows removed."),
  skipped: z
    .number()
    .int()
    .describe(
      "`upsert`/`update` ops whose content hash matched the stored state (no write, no version bump)."
    ),
});

export const graphNodeBatchResultSchema = z
  .object({
    items: z
      .array(graphNodeResponseSchema)
      .describe(
        "Resulting state of every created/updated/upserted node, in input order. Deleted nodes appear only in the summary."
      ),
    summary: graphBatchSummarySchema,
  })
  .describe("Node portion of a changeset result.");

export const graphEdgeBatchResultSchema = z
  .object({
    items: z
      .array(graphEdgeResponseSchema)
      .describe(
        "Resulting state of every created/updated/upserted edge, in input order. Deleted edges appear only in the summary."
      ),
    summary: graphBatchSummarySchema,
  })
  .describe("Edge portion of a changeset result.");

/**
 * The changeset body's fields, before the at-least-one-op check.
 *
 * Exported because the check makes the schema a `ZodEffects`, which cannot be
 * merged: a caller adding its own field (the MCP tools, which carry the scope
 * as an input rather than a path) composes on this and lets the server's own
 * DTO apply the check. That split is already the rule for a descriptor's
 * `scopes` pre-flight, which is likewise a fail-fast rather than the source of
 * truth.
 */
export const graphBatchFieldsSchema = z.object({
  groupId: ownerGroupSchema,
  nodes: z
    .array(graphNodeOpSchema)
    .max(MAX_OPS_PER_KIND)
    .optional()
    .default([])
    .describe(`Node operations. Max ${MAX_OPS_PER_KIND} per call.`),
  edges: z
    .array(graphEdgeOpSchema)
    .max(MAX_OPS_PER_KIND)
    .optional()
    .default([])
    .describe(`Edge operations. Max ${MAX_OPS_PER_KIND} per call.`),
});

export const graphBatchInputSchema = graphBatchFieldsSchema
  .refine((body) => body.nodes.length + body.edges.length > 0, {
    message: "Provide at least one node or edge op.",
  })
  .describe(
    "Body for the graph changeset route (`POST /orgs/:orgId/graph`, `POST /projects/:projectId/graph`). One call = one " +
      "transaction: either every op applies or none does. The collection's scope is where the whole changeset applies and " +
      "which partition its rows land in; every op is scope-strict, so an `update` or `delete` whose id lives outside it " +
      "surfaces as a not-found error. Pass `groupId` to have the rows owned by a group other than the scope's own, which is " +
      "how a contractor's import belongs to the contractor. " +
      "The server orders the transaction node writes -> edge writes -> edge deletes -> node deletes, regardless of array " +
      "position, so a node and the edges touching it can ride in the same call; an edge that points at a node deleted in the " +
      "same changeset is rejected. Send a single op as an array of one."
  );

export const graphBatchResponseSchema = z
  .object({
    nodes: graphNodeBatchResultSchema,
    edges: graphEdgeBatchResultSchema,
  })
  .describe("Graph changeset result, split by kind.");

export type GraphBatchSummary = z.infer<typeof graphBatchSummarySchema>;
export type GraphNodeBatchResult = z.infer<typeof graphNodeBatchResultSchema>;
export type GraphEdgeBatchResult = z.infer<typeof graphEdgeBatchResultSchema>;
export type GraphBatchInput = z.infer<typeof graphBatchInputSchema>;
export type GraphBatchResponse = z.infer<typeof graphBatchResponseSchema>;
