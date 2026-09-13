import { userResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../../common/descriptor";

const meMetadataDeleteInputSchema = z.object({
  keyPath: z
    .string()
    .min(1)
    .describe("Dotted key path to remove, e.g. `apps.platform.theme`."),
});

export const meMetadataDeleteTool = defineTool({
  name: "me_metadata_delete",
  description:
    "Remove a single key from your own metadata bag. Deleting a missing key is a no-op.",
  inputSchema: meMetadataDeleteInputSchema,
  outputSchema: userResponseSchema,
  resource: "api",
  endpoint: { method: "DELETE", path: "/me/metadata/{keyPath}" },
  scopes: ["openid"],
});
