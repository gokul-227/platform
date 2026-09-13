import { threadRunResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const threadRunsGetInputSchema = z.object({
  threadId: z.string().uuid().describe("The thread id."),
  runId: z.string().uuid().describe("The run id."),
});

export const threadRunsGetTool = defineTool({
  name: "thread_runs_get",
  description:
    "Fetch a run by id to poll its status and result. Terminal statuses are `complete`, `failed`, " +
    "`cancelled`; on `complete` the run carries the produced `messageId`.",
  inputSchema: threadRunsGetInputSchema,
  outputSchema: threadRunResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/threads/{threadId}/runs/{runId}" },
  scopes: ["openid"],
});
