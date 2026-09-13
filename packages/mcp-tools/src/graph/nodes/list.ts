/**
 * `graph_nodes_list` — proxy to `GET /graph/nodes` on apps/api.
 */

import {
  graphNodeFilters,
  graphNodeListResponseSchema,
  graphNodeListShape,
} from "@aec-craft/platform-contracts";

import { defineTool } from "../../common/descriptor";

export const graphNodesListTool = defineTool({
  name: "graph_nodes_list",
  description:
    "List graph nodes. Name exactly one of `orgId` or `projectId`: a project " +
    "read hydrates the project's own nodes with the parent org's shared " +
    'library, and `scope: "project"` narrows to the project\'s own. ' +
    "`select` projects the `properties` bag. Requires `read` on whichever " +
    "scope is named.",
  inputSchema: graphNodeListShape,
  outputSchema: graphNodeListResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/graph/nodes" },
  scopes: ["openid"],
  filterSpec: graphNodeFilters,
});
