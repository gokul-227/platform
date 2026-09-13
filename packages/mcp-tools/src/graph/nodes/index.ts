import type { ToolDescriptor } from "../../common/descriptor";

import { graphNodesGetTool } from "./get";
import { graphNodesListTool } from "./list";

export { graphNodesGetTool } from "./get";
export { graphNodesListTool } from "./list";

export const graphNodesTools: readonly ToolDescriptor[] = [
  graphNodesListTool,
  graphNodesGetTool,
];
