import type { ToolDescriptor } from "../../common/descriptor";

import { graphEdgesGetTool } from "./get";
import { graphEdgesListTool } from "./list";

export { graphEdgesGetTool } from "./get";
export { graphEdgesListTool } from "./list";

export const graphEdgesTools: readonly ToolDescriptor[] = [
  graphEdgesListTool,
  graphEdgesGetTool,
];
