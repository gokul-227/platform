import type { ToolDescriptor } from "../../common/descriptor";

import { threadMessagesCreateTool } from "./create";
import { threadMessagesListTool } from "./list";

export { threadMessagesCreateTool } from "./create";
export { threadMessagesListTool } from "./list";

export const threadMessageTools: readonly ToolDescriptor[] = [
  threadMessagesListTool,
  threadMessagesCreateTool,
];
