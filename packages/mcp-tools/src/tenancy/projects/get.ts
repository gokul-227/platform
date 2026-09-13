import { projectResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const projectsGetInputSchema = z.object({
  projectId: z.string().uuid().describe("The project id."),
});

export const projectsGetTool = defineTool({
  name: "projects_get",
  description: "Fetch a single project by id.",
  inputSchema: projectsGetInputSchema,
  outputSchema: projectResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/projects/{projectId}" },
  scopes: ["openid"],
});
