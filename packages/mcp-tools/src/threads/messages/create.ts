import {
  createThreadMessageInputSchema,
  threadMessageResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const threadMessagesCreateInputSchema = z
  .object({ threadId: z.string().uuid().describe("The thread id.") })
  .merge(createThreadMessageInputSchema);

export const threadMessagesCreateTool = defineTool({
  name: "thread_messages_create",
  description:
    "Append a message to a thread (e.g. a user question). Append-only; messages are never edited " +
    "or deleted.",
  inputSchema: threadMessagesCreateInputSchema,
  outputSchema: threadMessageResponseSchema,
  resource: "api",
  endpoint: { method: "POST", path: "/threads/{threadId}/messages" },
  scopes: ["openid"],
});
