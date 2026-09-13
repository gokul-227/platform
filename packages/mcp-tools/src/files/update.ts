/**
 * `files_update` — proxy to `PATCH /files/{fileId}` on apps/api.
 *
 * Rename or re-parent. Content bytes are immutable, so there is no
 * write path here: the tree is a database shape and moving a subtree copies
 * nothing in the bucket.
 */

import {
  fileResponseSchema,
  updateFileInputSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../common/descriptor";

const filesUpdateInputSchema = z
  .object({
    fileId: z.string().uuid().describe("The file or folder id."),
  })
  .merge(updateFileInputSchema);

export const filesUpdateTool = defineTool({
  name: "files_update",
  description:
    "Rename a file or folder or move it to another folder (`parentId`, null for " +
    "the root). Metadata is written one key at a time with `file_metadata_set`. " +
    "Moving a folder moves its whole " +
    "subtree and copies nothing, since the tree lives in the database. Content " +
    "bytes are immutable. Requires `write` on the organization or the project.",
  inputSchema: filesUpdateInputSchema,
  outputSchema: fileResponseSchema,
  resource: "api",
  endpoint: { method: "PATCH", path: "/files/{fileId}" },
  scopes: ["openid"],
});
