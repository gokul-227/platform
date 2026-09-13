import type { ToolDescriptor } from "../../common/descriptor";

import { fileMetadataDeleteTool } from "./delete";
import { fileMetadataSetTool } from "./set";

export { fileMetadataDeleteTool } from "./delete";
export { fileMetadataSetTool } from "./set";

export const fileMetadataTools: readonly ToolDescriptor[] = [
  fileMetadataSetTool,
  fileMetadataDeleteTool,
];
