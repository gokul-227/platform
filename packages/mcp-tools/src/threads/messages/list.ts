import {
  threadMessageFilters,
  threadMessageListInputSchema,
  threadMessageListResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const threadMessagesListInputSchema = z
  .object({ threadId: z.string().uuid().describe("The thread id.") })
  .merge(threadMessageListInputSchema);

export const threadMessagesListTool = defineTool({
  name: "thread_messages_list",
  description:
    "List a thread's messages, oldest-first. Only the thread's owner can read them.",
  inputSchema: threadMessagesListInputSchema,
  outputSchema: threadMessageListResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/threads/{threadId}/messages" },
  scopes: ["openid"],
  filterSpec: threadMessageFilters,
});
