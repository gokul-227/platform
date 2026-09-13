/**
 * `audit_events_list` — proxy to `GET /audit/events` on apps/api.
 */

import {
  auditEventFilters,
  auditEventListInputSchema,
  auditEventListResponseSchema,
} from "@aec-craft/platform-contracts";

import { defineTool } from "../common/descriptor";

export const auditListTool = defineTool({
  name: "audit_events_list",
  description:
    "List audit events, newest first. Name exactly one of `orgId` or " +
    "`projectId`: an organization's feed includes every project under it. This " +
    "is the actor trail — who did what to which resource and when — so it " +
    "answers questions the current state cannot, like who removed a member or " +
    "when a standing changed. Requires `read` on whichever scope is named.",
  inputSchema: auditEventListInputSchema,
  outputSchema: auditEventListResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/audit/events" },
  scopes: ["openid"],
  filterSpec: auditEventFilters,
});
