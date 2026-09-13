import {
  projectResponseSchema,
  setMetadataInputSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../../common/descriptor";

const projectMetadataSetInputSchema = z
  .object({
    projectId: z.string().uuid().describe("The project id."),
    keyPath: z
      .string()
      .min(1)
      .describe(
        "Dotted key path into the project metadata bag, e.g. `apps.platform.units`."
      ),
  })
  .merge(setMetadataInputSchema);

export const projectMetadataSetTool = defineTool({
  name: "project_metadata_set",
  description:
    "Merge-write a single key into a project's metadata bag. The value at the dotted " +
    "key path is replaced; sibling keys are preserved. Requires `project:update`.",
  inputSchema: projectMetadataSetInputSchema,
  outputSchema: projectResponseSchema,
  resource: "api",
  endpoint: { method: "PUT", path: "/projects/{projectId}/metadata/{keyPath}" },
  scopes: ["openid"],
});
