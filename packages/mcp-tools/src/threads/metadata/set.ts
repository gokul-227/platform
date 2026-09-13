import {
  setMetadataInputSchema,
  threadResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const threadMetadataSetInputSchema = z
  .object({
    threadId: z.string().uuid().describe("The thread id."),
    keyPath: z
      .string()
      .min(1)
      .describe(
        "Dotted key path into the thread metadata bag, e.g. `apps.studio.promptSpec`."
      ),
  })
  .merge(setMetadataInputSchema);

export const threadMetadataSetTool = defineTool({
  name: "thread_metadata_set",
  description:
    "Merge-write a single key into a thread's metadata bag. The value at the dotted key " +
    "path is replaced; sibling keys are preserved. Requires `write` on the thread.",
  inputSchema: threadMetadataSetInputSchema,
  outputSchema: threadResponseSchema,
  resource: "api",
  endpoint: { method: "PUT", path: "/threads/{threadId}/metadata/{keyPath}" },
  scopes: ["openid"],
});
