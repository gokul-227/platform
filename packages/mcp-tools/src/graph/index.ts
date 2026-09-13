/**
 * Graph-domain tools. Composed into the package's root `ALL_TOOLS` list.
 *
 * Nested per apps/api: `nodes/`, `edges/` and `query/` mirror
 * `packages/graph-api/src/modules/{nodes,edges,query}/`, and the
 * changeset splits by the scope it applies to (`orgs/`, `projects/`) the same
 * way its route does.
 */

import type { ToolDescriptor } from "../common/descriptor";
import { graphApplyTool } from "./apply";
import { graphEdgesTools } from "./edges";
import { graphNodesTools } from "./nodes";
import { graphQueryTools } from "./query";

export { graphApplyTool } from "./apply";
export * from "./edges";
export * from "./nodes";
export * from "./query";

export const graphTools: readonly ToolDescriptor[] = [
  graphApplyTool,
  ...graphNodesTools,
  ...graphEdgesTools,
  ...graphQueryTools,
];
