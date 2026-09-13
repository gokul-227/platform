import {
  setMetadataInputSchema,
  threadRunResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../../common/descriptor";

const threadRunMetadataSetInputSchema = z
  .object({
    threadId: z.string().uuid().describe("The thread id."),
    runId: z.string().uuid().describe("The run id."),
    keyPath: z
      .string()
      .min(1)
      .describe(
        "Dotted key path into the run metadata bag, e.g. `apps.studio.promptSpec`."
      ),
  })
  .merge(setMetadataInputSchema);

export const threadRunMetadataSetTool = defineTool({
  name: "thread_run_metadata_set",
  description:
    "Merge-write a single key into a run's metadata bag. The value at the dotted key " +
    "path is replaced; sibling keys are preserved. A finished run still accepts these " +
    "writes. Requires `write` on the thread.",
  inputSchema: threadRunMetadataSetInputSchema,
  outputSchema: threadRunResponseSchema,
  resource: "api",
  endpoint: {
    method: "PUT",
    path: "/threads/{threadId}/runs/{runId}/metadata/{keyPath}",
  },
  scopes: ["openid"],
});
