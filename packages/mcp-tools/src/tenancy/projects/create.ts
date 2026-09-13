import {
  createProjectInputSchema,
  projectResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const projectsCreateInputSchema = z
  .object({
    orgId: z.string().uuid().describe("The parent organization id."),
  })
  .merge(createProjectInputSchema);

export const projectsCreateTool = defineTool({
  name: "projects_create",
  description:
    "Create a new project under an organization. Requires `write` on the " +
    "organization. `slug` must be unique within the org and is the URL-" +
    "safe handle clients use to reference the project; `name` is the display " +
    "label. Returns the created project with its server-assigned `id`.",
  inputSchema: projectsCreateInputSchema,
  outputSchema: projectResponseSchema,
  resource: "api",
  endpoint: { method: "POST", path: "/orgs/{orgId}/projects" },
  scopes: ["openid"],
});
