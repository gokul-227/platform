import type { ToolDescriptor } from "../../../common/descriptor";

import { projectMetadataDeleteTool } from "./delete";
import { projectMetadataSetTool } from "./set";

export { projectMetadataDeleteTool } from "./delete";
export { projectMetadataSetTool } from "./set";

export const projectMetadataTools: readonly ToolDescriptor[] = [
  projectMetadataSetTool,
  projectMetadataDeleteTool,
];
