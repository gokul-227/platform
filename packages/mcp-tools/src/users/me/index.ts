import type { ToolDescriptor } from "../../common/descriptor";

import { meGetTool } from "./get";
import { meMetadataTools } from "./metadata";
import { meUpdateTool } from "./update";

export { meGetTool } from "./get";
export * from "./metadata";
export { meUpdateTool } from "./update";

export const meTools: readonly ToolDescriptor[] = [
  meGetTool,
  meUpdateTool,
  ...meMetadataTools,
];
