import {
  setMetadataInputSchema,
  userResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../../common/descriptor";

const meMetadataSetInputSchema = z
  .object({
    keyPath: z
      .string()
      .min(1)
      .describe(
        "Dotted key path into your metadata bag, e.g. `apps.platform.theme`."
      ),
  })
  .merge(setMetadataInputSchema);

export const meMetadataSetTool = defineTool({
  name: "me_metadata_set",
  description:
    "Merge-write a single key into your own metadata bag. The value at the dotted " +
    "key path is replaced; sibling keys are preserved. Metadata can only be written " +
    "this way \u2014 `me_update` does not accept it.",
  inputSchema: meMetadataSetInputSchema,
  outputSchema: userResponseSchema,
  resource: "api",
  endpoint: { method: "PUT", path: "/me/metadata/{keyPath}" },
  scopes: ["openid"],
});
