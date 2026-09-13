import type { ToolDescriptor } from "../../common/descriptor";

import { threadMetadataDeleteTool } from "./delete";
import { threadMetadataSetTool } from "./set";

export { threadMetadataDeleteTool } from "./delete";
export { threadMetadataSetTool } from "./set";

export const threadMetadataTools: readonly ToolDescriptor[] = [
  threadMetadataSetTool,
  threadMetadataDeleteTool,
];
