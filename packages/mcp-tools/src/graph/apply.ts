/**
 * `graph_apply` — proxy to `POST /graph` on apps/api.
 */

import {
  graphBatchFieldsSchema,
  graphBatchResponseSchema,
  scopeQueryShape,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

const graphApplyInputSchema = z
  .object(scopeQueryShape)
  .merge(graphBatchFieldsSchema);

import { defineTool } from "../common/descriptor";

export const graphApplyTool = defineTool({
  name: "graph_apply",
  description:
    "Apply a graph changeset in one transaction. Name exactly one of `orgId` " +
    "or `projectId`: the rows land in whichever it names. Send " +
    "`{ nodes?, edges? }` where each op is tagged by `op`: `create` (insert; an existing id is a " +
    "conflict), `upsert` (create-or-replace by id, idempotent), `update` (replace fields, " +
    "bump version; edge endpoints immutable), `delete` (remove; node deletes cascade edges). " +
    "Use a single-element array for one mutation. The server orders the transaction node " +
    "writes -> edge writes -> edge deletes -> node deletes, so a node and the edges touching " +
    "it (referencing it by a client-supplied id) can ride in the same call. Either every op " +
    "applies or none does. Requires `write` on the scope named, or on `groupId` when " +
    "one is named. Returns `{ nodes, edges }`, each with `items` (resulting rows for " +
    "writes, in input order) and a `summary` (`created`/`updated`/`deleted`/`skipped`).",
  inputSchema: graphApplyInputSchema,
  outputSchema: graphBatchResponseSchema,
  resource: "api",
  endpoint: { method: "POST", path: "/graph" },
  scopes: ["openid"],
});
