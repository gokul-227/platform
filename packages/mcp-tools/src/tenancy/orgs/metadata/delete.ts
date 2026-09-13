import { orgResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../../common/descriptor";

const orgMetadataDeleteInputSchema = z.object({
  orgId: z.string().uuid().describe("The organization id."),
  keyPath: z
    .string()
    .min(1)
    .describe("Dotted key path to remove, e.g. `apps.platform.theme`."),
});

export const orgMetadataDeleteTool = defineTool({
  name: "org_metadata_delete",
  description:
    "Remove a single key from an organization's metadata bag. Deleting a missing key " +
    "is a no-op. Requires `org:update`.",
  inputSchema: orgMetadataDeleteInputSchema,
  outputSchema: orgResponseSchema,
  resource: "api",
  endpoint: { method: "DELETE", path: "/orgs/{orgId}/metadata/{keyPath}" },
  scopes: ["openid"],
});
