/**
 * `graph_nodes_get` — proxy to `GET /graph/nodes/{nodeId}` on apps/api.
 *
 * Fetches a single node by id, with optional `select=` projection of the
 * `properties` bag. The first descriptor exercising the path-template
 * feature: the `nodeId` input field is pulled out of the args + URL-encoded
 * into the path, remaining fields become query string.
 */

import {
  getGraphNodeQuerySchema,
  graphNodeResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const graphNodesGetInputSchema = z
  .object({
    nodeId: z.string().uuid().describe("The graph node id."),
  })
  .merge(getGraphNodeQuerySchema);

export const graphNodesGetTool = defineTool({
  name: "graph_nodes_get",
  description:
    "Fetch a single graph node by id. Optional `?select=key1&select=key2` " +
    "trims the response's `properties` bag to specific top-level keys " +
    "(missing keys come back as `null`).",
  inputSchema: graphNodesGetInputSchema,
  outputSchema: graphNodeResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/graph/nodes/{nodeId}" },
  scopes: ["openid"],
});
