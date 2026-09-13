import {
  orgResponseSchema,
  setMetadataInputSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../../common/descriptor";

const orgMetadataSetInputSchema = z
  .object({
    orgId: z.string().uuid().describe("The organization id."),
    keyPath: z
      .string()
      .min(1)
      .describe(
        "Dotted key path into the org metadata bag, e.g. `apps.platform.theme`."
      ),
  })
  .merge(setMetadataInputSchema);

export const orgMetadataSetTool = defineTool({
  name: "org_metadata_set",
  description:
    "Merge-write a single key into an organization's metadata bag. The value at the " +
    "dotted key path is replaced; sibling keys are preserved. Requires `org:update`.",
  inputSchema: orgMetadataSetInputSchema,
  outputSchema: orgResponseSchema,
  resource: "api",
  endpoint: { method: "PUT", path: "/orgs/{orgId}/metadata/{keyPath}" },
  scopes: ["openid"],
});
