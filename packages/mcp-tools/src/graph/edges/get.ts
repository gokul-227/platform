import {
  getGraphEdgeQuerySchema,
  graphEdgeResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const graphEdgesGetInputSchema = z
  .object({
    edgeId: z.string().uuid().describe("The graph edge id."),
  })
  .merge(getGraphEdgeQuerySchema);

export const graphEdgesGetTool = defineTool({
  name: "graph_edges_get",
  description:
    "Fetch a single graph edge by id. Optional `?select=key1&select=key2` " +
    "trims the response's `properties` bag to specific top-level keys " +
    "(missing keys come back as `null`).",
  inputSchema: graphEdgesGetInputSchema,
  outputSchema: graphEdgeResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/graph/edges/{edgeId}" },
  scopes: ["openid"],
});
