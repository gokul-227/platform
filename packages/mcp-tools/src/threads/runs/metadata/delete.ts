import { threadRunResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../../common/descriptor";

const threadRunMetadataDeleteInputSchema = z.object({
  threadId: z.string().uuid().describe("The thread id."),
  runId: z.string().uuid().describe("The run id."),
  keyPath: z
    .string()
    .min(1)
    .describe("Dotted key path to remove, e.g. `apps.studio.promptSpec`."),
});

export const threadRunMetadataDeleteTool = defineTool({
  name: "thread_run_metadata_delete",
  description:
    "Remove a single key from a run's metadata bag. Deleting a missing key is a no-op. " +
    "Requires `write` on the thread.",
  inputSchema: threadRunMetadataDeleteInputSchema,
  outputSchema: threadRunResponseSchema,
  resource: "api",
  endpoint: {
    method: "DELETE",
    path: "/threads/{threadId}/runs/{runId}/metadata/{keyPath}",
  },
  scopes: ["openid"],
});
