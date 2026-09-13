import { orgResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const orgsGetInputSchema = z.object({
  orgId: z.string().uuid().describe("The organization id."),
});

export const orgsGetTool = defineTool({
  name: "orgs_get",
  description: "Fetch a single organization by id.",
  inputSchema: orgsGetInputSchema,
  outputSchema: orgResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/orgs/{orgId}" },
  scopes: ["openid"],
});
