import { projectResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../../common/descriptor";

const projectMetadataDeleteInputSchema = z.object({
  projectId: z.string().uuid().describe("The project id."),
  keyPath: z
    .string()
    .min(1)
    .describe("Dotted key path to remove, e.g. `apps.platform.units`."),
});

export const projectMetadataDeleteTool = defineTool({
  name: "project_metadata_delete",
  description:
    "Remove a single key from a project's metadata bag. Deleting a missing key is a " +
    "no-op. Requires `project:update`.",
  inputSchema: projectMetadataDeleteInputSchema,
  outputSchema: projectResponseSchema,
  resource: "api",
  endpoint: {
    method: "DELETE",
    path: "/projects/{projectId}/metadata/{keyPath}",
  },
  scopes: ["openid"],
});
