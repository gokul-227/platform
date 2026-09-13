import {
  createThreadInputSchema,
  threadResponseSchema,
} from "@aec-craft/platform-contracts";

import { defineTool } from "../common/descriptor";

export const threadsCreateTool = defineTool({
  name: "threads_create",
  description:
    "Create a chat thread in an org or project scope. The owner is stamped from the token, never " +
    "the body. Returns the created thread with its server-assigned `id`.",
  inputSchema: createThreadInputSchema,
  outputSchema: threadResponseSchema,
  resource: "api",
  endpoint: { method: "POST", path: "/threads" },
  scopes: ["openid"],
});
