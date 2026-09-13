import { fileResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const fileMetadataDeleteInputSchema = z.object({
  fileId: z.string().uuid().describe("The file or folder id."),
  keyPath: z
    .string()
    .min(1)
    .describe("Dotted key path to remove, e.g. `apps.platform.purpose`."),
});

export const fileMetadataDeleteTool = defineTool({
  name: "file_metadata_delete",
  description:
    "Remove a single key from a file or folder's metadata bag. Deleting a missing key " +
    "is a no-op. Requires `write` on the file.",
  inputSchema: fileMetadataDeleteInputSchema,
  outputSchema: fileResponseSchema,
  resource: "api",
  endpoint: { method: "DELETE", path: "/files/{fileId}/metadata/{keyPath}" },
  scopes: ["openid"],
});
