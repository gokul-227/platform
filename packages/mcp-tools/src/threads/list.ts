/**
 * `threads_list` — proxy to `GET /threads` on apps/api.
 *
 * Lists the current user's chat threads in one scope (threads are not shared).
 */

import {
  threadFilters,
  threadListInputSchema,
  threadListResponseSchema,
} from "@aec-craft/platform-contracts";

import { defineTool } from "../common/descriptor";

export const threadsListTool = defineTool({
  name: "threads_list",
  description:
    "List the current user's chat threads in one scope. Provide exactly one of `orgId` or " +
    "`projectId`. Returns only the caller's own threads, most-recently-updated first.",
  inputSchema: threadListInputSchema,
  outputSchema: threadListResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/threads" },
  scopes: ["openid"],
  filterSpec: threadFilters,
});
