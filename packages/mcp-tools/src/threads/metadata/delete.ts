import { threadResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const threadMetadataDeleteInputSchema = z.object({
  threadId: z.string().uuid().describe("The thread id."),
  keyPath: z
    .string()
    .min(1)
    .describe("Dotted key path to remove, e.g. `apps.studio.promptSpec`."),
});

export const threadMetadataDeleteTool = defineTool({
  name: "thread_metadata_delete",
  description:
    "Remove a single key from a thread's metadata bag. Deleting a missing key is a " +
    "no-op. Requires `write` on the thread.",
  inputSchema: threadMetadataDeleteInputSchema,
  outputSchema: threadResponseSchema,
  resource: "api",
  endpoint: {
    method: "DELETE",
    path: "/threads/{threadId}/metadata/{keyPath}",
  },
  scopes: ["openid"],
});
