/**
 * `org_files_folders_create` — proxy to `POST /orgs/{orgId}/files` on apps/api,
 * pinned to `type: "folder"`.
 *
 * The same route creates files, but that half hands back a signed URL the
 * caller then PUTs bytes to, and this transport speaks JSON only. A folder is
 * the whole of what an agent can create here, so the tool says so rather than
 * exposing a shape it cannot finish.
 */

import {
  createFileInputSchema,
  createFileResponseSchema,
  scopeQueryShape,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../common/descriptor";

const inputSchema = z
  .object(scopeQueryShape)
  .merge(
    createFileInputSchema.omit({
      type: true,
      contentType: true,
      size: true,
      checksum: true,
      preset: true,
      system: true,
    })
  )
  .extend({ type: z.literal("folder").default("folder") });

export const filesFoldersCreateTool = defineTool({
  name: "files_folders_create",
  description:
    "Create a folder. Name exactly one of `orgId` or `projectId`. `parentId` nests it under " +
    "another folder; omit for the root. Names are unique per folder and scope, " +
    "case-insensitively, so a repeat answers `FILE_NAME_CONFLICT`. Requires " +
    "`write` on whichever scope is named, or on `groupId` when one is named. " +
    "Uploading bytes is not available over MCP: it needs a signed PUT to storage.",
  inputSchema,
  outputSchema: createFileResponseSchema,
  resource: "api",
  endpoint: { method: "POST", path: "/files" },
  scopes: ["openid"],
});
