import { threadRunResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const threadRunsCreateInputSchema = z.object({
  threadId: z.string().uuid().describe("The thread id."),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Opaque app data to store on the run (e.g. prompt provenance)."),
});

export const threadRunsCreateTool = defineTool({
  name: "thread_runs_create",
  description:
    "Start a generation run on a thread. Creates a `queued` run that the producer then finalizes. " +
    "Returns the run; poll it with `thread_runs_get` to observe completion.",
  inputSchema: threadRunsCreateInputSchema,
  outputSchema: threadRunResponseSchema,
  resource: "api",
  endpoint: { method: "POST", path: "/threads/{threadId}/runs" },
  scopes: ["openid"],
});
