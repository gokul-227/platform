import type { ToolDescriptor } from "../../../common/descriptor";

import { threadRunMetadataDeleteTool } from "./delete";
import { threadRunMetadataSetTool } from "./set";

export { threadRunMetadataDeleteTool } from "./delete";
export { threadRunMetadataSetTool } from "./set";

export const threadRunMetadataTools: readonly ToolDescriptor[] = [
  threadRunMetadataSetTool,
  threadRunMetadataDeleteTool,
];
