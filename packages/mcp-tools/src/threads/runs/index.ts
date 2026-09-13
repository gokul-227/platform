import type { ToolDescriptor } from "../../common/descriptor";

import { threadRunsCreateTool } from "./create";
import { threadRunsGetTool } from "./get";
import { threadRunsListTool } from "./list";
import { threadRunMetadataTools } from "./metadata";

export { threadRunsCreateTool } from "./create";
export { threadRunsGetTool } from "./get";
export { threadRunsListTool } from "./list";
export * from "./metadata";

export const threadRunTools: readonly ToolDescriptor[] = [
  threadRunsListTool,
  threadRunsCreateTool,
  threadRunsGetTool,
  ...threadRunMetadataTools,
];
