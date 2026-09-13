/**
 * `audit_events_get` — proxy to `GET /audit/events/{eventId}` on apps/api.
 */

import {
  auditEventGetInputSchema,
  auditEventResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../common/descriptor";

const auditGetInputSchema = z
  .object({ eventId: z.string().uuid().describe("The audit event id.") })
  .merge(auditEventGetInputSchema.innerType());

export const auditGetTool = defineTool({
  name: "audit_events_get",
  description:
    "Fetch one audit event by id, within the scope named. Carries the actor, " +
    "the resource, the verb and the before/after detail the list view " +
    "summarizes. Name exactly one of `orgId` or `projectId`; an event outside " +
    "that scope is absent rather than refused. Requires `read` on it.",
  inputSchema: auditGetInputSchema,
  outputSchema: auditEventResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/audit/events/{eventId}" },
  scopes: ["openid"],
});
