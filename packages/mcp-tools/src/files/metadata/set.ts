import {
  fileResponseSchema,
  setMetadataInputSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const fileMetadataSetInputSchema = z
  .object({
    fileId: z.string().uuid().describe("The file or folder id."),
    keyPath: z
      .string()
      .min(1)
      .describe(
        "Dotted key path into the file metadata bag, e.g. `apps.platform.purpose`."
      ),
  })
  .merge(setMetadataInputSchema);

export const fileMetadataSetTool = defineTool({
  name: "file_metadata_set",
  description:
    "Merge-write a single key into a file or folder's metadata bag. The value at the " +
    "dotted key path is replaced; sibling keys are preserved. Requires `write` on the file.",
  inputSchema: fileMetadataSetInputSchema,
  outputSchema: fileResponseSchema,
  resource: "api",
  endpoint: { method: "PUT", path: "/files/{fileId}/metadata/{keyPath}" },
  scopes: ["openid"],
});
