import type { ToolDescriptor } from "../../../common/descriptor";

import { meMetadataDeleteTool } from "./delete";
import { meMetadataSetTool } from "./set";

export { meMetadataDeleteTool } from "./delete";
export { meMetadataSetTool } from "./set";

export const meMetadataTools: readonly ToolDescriptor[] = [
  meMetadataSetTool,
  meMetadataDeleteTool,
];
