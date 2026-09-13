import { threadResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../common/descriptor";

const threadsGetInputSchema = z.object({
  threadId: z.string().uuid().describe("The thread id."),
});

export const threadsGetTool = defineTool({
  name: "threads_get",
  description:
    "Fetch a single chat thread by id. Only the thread's owner can read it.",
  inputSchema: threadsGetInputSchema,
  outputSchema: threadResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/threads/{threadId}" },
  scopes: ["openid"],
});
