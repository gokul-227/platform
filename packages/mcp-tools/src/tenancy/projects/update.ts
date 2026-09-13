import {
  projectResponseSchema,
  updateProjectInputSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const projectsUpdateInputSchema = z
  .object({
    projectId: z.string().uuid().describe("The project id to update."),
  })
  .merge(updateProjectInputSchema);

export const projectsUpdateTool = defineTool({
  name: "projects_update",
  description:
    "Update a project's name or slug. All body fields are optional; " +
    "supplied fields replace the row's values. Slug uniqueness is enforced " +
    "within the parent org. Requires `project:update` on the project.",
  inputSchema: projectsUpdateInputSchema,
  outputSchema: projectResponseSchema,
  resource: "api",
  endpoint: { method: "PATCH", path: "/projects/{projectId}" },
  scopes: ["openid"],
});
