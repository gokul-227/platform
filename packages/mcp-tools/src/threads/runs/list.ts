import {
  threadRunFilters,
  threadRunListInputSchema,
  threadRunListResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const threadRunsListInputSchema = z
  .object({ threadId: z.string().uuid().describe("The thread id.") })
  .merge(threadRunListInputSchema);

export const threadRunsListTool = defineTool({
  name: "thread_runs_list",
  description:
    "List a thread's runs, newest-first. Only the thread's owner can read them.",
  inputSchema: threadRunsListInputSchema,
  outputSchema: threadRunListResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/threads/{threadId}/runs" },
  scopes: ["openid"],
  filterSpec: threadRunFilters,
});
