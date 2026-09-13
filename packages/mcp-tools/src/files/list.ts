/**
 * `org_files_list` — proxy to `GET /orgs/{orgId}/files` on apps/api.
 *
 * The tree is browsed one level at a time: `parentId` opens a folder, omitting
 * it lists the scope root. `hasChildren` on each row is what tells the agent
 * whether a folder is worth opening without a second call.
 */

import {
  fileFilters,
  fileListInputSchema,
  fileListResponseSchema,
  scopeQueryShape,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../common/descriptor";

const inputSchema = z.object(scopeQueryShape).merge(fileListInputSchema);

export const filesListTool = defineTool({
  name: "files_list",
  description:
    "List files and folders. Name exactly one of `orgId` or `projectId`, one level at a time. Pass " +
    "`parentId` to open a folder, omit it for the root; each row's " +
    "`hasChildren` says whether a folder has anything in it. A `file` row is " +
    "only readable once its `status` is `ready`. Requires `read` on the " +
    "organization or the project.",
  inputSchema,
  outputSchema: fileListResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/files" },
  scopes: ["openid"],
  filterSpec: fileFilters,
});
