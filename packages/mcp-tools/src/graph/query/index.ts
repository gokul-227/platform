import type { ToolDescriptor } from "../../common/descriptor";

import { graphHealthTool } from "./health";
import { graphQueryTool } from "./query";

export { graphHealthTool } from "./health";
export { graphQueryTool } from "./query";

export const graphQueryTools: readonly ToolDescriptor[] = [
  graphQueryTool,
  graphHealthTool,
];
