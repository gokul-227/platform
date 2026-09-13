/**
 * `files_get` — proxy to `GET /files/{fileId}` on apps/api.
 *
 * The scope is resolved from the row, so no org or project id is needed.
 */

import { fileResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../common/descriptor";

const filesGetInputSchema = z.object({
  fileId: z.string().uuid().describe("The file or folder id."),
});

export const filesGetTool = defineTool({
  name: "files_get",
  description:
    "Fetch one file or folder by id. The scope comes from the row, so no org or " +
    "project id is needed. `content` carries the content type, size and checksum " +
    "for a file and is null for a folder; use `files_download` for the bytes.",
  inputSchema: filesGetInputSchema,
  outputSchema: fileResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/files/{fileId}" },
  scopes: ["openid"],
});
