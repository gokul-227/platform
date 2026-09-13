/**
 * `graph_edges_list` — proxy to `GET /graph/edges` on apps/api.
 */

import {
  graphEdgeFilters,
  graphEdgeListResponseSchema,
  graphEdgeListShape,
} from "@aec-craft/platform-contracts";

import { defineTool } from "../../common/descriptor";

export const graphEdgesListTool = defineTool({
  name: "graph_edges_list",
  description:
    "List graph edges. Name exactly one of `orgId` or `projectId`: a project " +
    "read hydrates the project's own edges with the parent org's shared " +
    'library, and `scope: "project"` narrows to the project\'s own. Requires ' +
    "`read` on whichever scope is named.",
  inputSchema: graphEdgeListShape,
  outputSchema: graphEdgeListResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/graph/edges" },
  scopes: ["openid"],
  filterSpec: graphEdgeFilters,
});
