import type { ToolDescriptor } from "../../../common/descriptor";

import { orgMetadataDeleteTool } from "./delete";
import { orgMetadataSetTool } from "./set";

export { orgMetadataDeleteTool } from "./delete";
export { orgMetadataSetTool } from "./set";

export const orgMetadataTools: readonly ToolDescriptor[] = [
  orgMetadataSetTool,
  orgMetadataDeleteTool,
];
