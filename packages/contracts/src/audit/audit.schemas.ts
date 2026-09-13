import { z } from "zod";
import { scopeQueryRefinement, scopeQueryShape } from "../common/scope";
import { listInputSchema, listResponseSchema } from "../query";
import { auditEventList } from "./audit.filters";

/**
 * Audit-event wire shape. Two-column event model: `resource` (the noun)
 * + `verb` (what was done). Cleaner queries (`WHERE resource = 'org' AND
 * verb = 'created'`) and cleaner rendering (noun → "Organization", verb
 * → "created" → "Organization created"). Combined uniqueness enforced at
 * the type layer via `AUDIT_ACTIONS` in
 * `@aec-craft/platform-contracts/audit/audit.vocabulary`.
 *
 *   - `resourceId` always set in v1 for the actions we emit; nullable for
 *     forward-compat.
 *   - `context` jsonb for transport-specific correlation (`requestId`,
 *     `ip`, `userAgent` for HTTP; `toolCallId` for MCP; `jobName` for cron).
 *   - `payload` jsonb for domain-specific structured details.
 *   - No `error` / failure capture — failures live in pino logs; this log
 *     captures successful state-changing actor-attributable mutations only.
 *   - No graph actions — `node.*` / `edge.*` get their own domain-history
 *     tables (future PLT).
 */
export const auditEventResponseSchema = z
  .object({
    id: z.string().uuid().describe("Stable audit-event id."),
    orgId: z
      .string()
      .uuid()
      .nullable()
      .describe("Org scope; null for org-less events."),
    projectId: z
      .string()
      .uuid()
      .nullable()
      .describe("Project scope; null for org-only events."),
    groupId: z
      .string()
      .uuid()
      .nullable()
      .describe(
        "The group whose work this touched; null for events outside the tree."
      ),
    actorId: z
      .string()
      .uuid()
      .nullable()
      .describe(
        "The person who acted, as the platform's own `user.id`. Null when no person did: a `system` action, or a machine, which has a client id rather than a profile — `actorType` says which. " +
          "The platform id rather than the identity subject, so a name resolved through it survives an identity-provider swap."
      ),
    actorType: z
      .string()
      .min(1)
      .describe(
        "Actor type: `user` for a person, `service` for a machine, `system` for a platform-internal action with no caller."
      ),
    actorIsStaff: z
      .boolean()
      .describe(
        "The change came through the staff surface, so it bypassed this partition's own permits. Says that it came from the vendor, never which role did it."
      ),
    resource: z
      .string()
      .min(1)
      .describe("The resource type acted on (org | project | org_member | …)."),
    resourceLabel: z
      .string()
      .nullable()
      .describe(
        "What the event was about, as it was named at the time. `resourceId` is how to reach it; this is how a row reads. " +
          "Null only for rows written before this was recorded: it cannot be resolved afterwards, since a delete removes the row that held the name."
      ),
    resourceId: z
      .string()
      .uuid()
      .nullable()
      .describe("Resource row id. Always set in v1 for the actions we record."),
    verb: z
      .string()
      .min(1)
      .describe(
        "What was done to the resource (created | updated | deleted | added | removed | …)."
      ),
    context: z
      .record(z.string(), z.unknown())
      .describe(
        "Transport-specific correlation bag: `{transport:'http', requestId, ip, userAgent}` for browser/SDK; " +
          "`{transport:'mcp', toolCallId, agentClientId}` for MCP; `{transport:'system', jobName}` for cron."
      ),
    payload: z
      .record(z.string(), z.unknown())
      .nullable()
      .describe(
        "What the event did, in one shape across every resource: `before` and `after` hold the state that moved, " +
          "so a reader diffs them without knowing the resource. A create carries only `after`, a delete only `before`, " +
          "an edit both. Anything that is a fact about the event rather than a change (`metadataKey`, `subject`) sits " +
          "beside them. Small."
      ),
    createdAt: z
      .string()
      .datetime()
      .describe("When the event was recorded (ISO 8601)."),
  })
  .describe("A single audit event. Immutable — there is no update endpoint.");

export const auditEventListInputSchema = listInputSchema(auditEventList)
  .extend(scopeQueryShape)
  .superRefine((query, ctx) => scopeQueryRefinement(query, ctx))
  .describe(
    "Query for listing audit events. Name exactly one of `orgId` or `projectId`. Default sort is " +
      "`createdAt:desc`; cursor pagination via `?limit=` + `?cursor=`. Filter framework supports " +
      "`?resource=in.(org,org_member)`, `?verb=eq.deleted`, `?actorId=eq.<uuid>`, " +
      "`?createdAt=gte.2026-06-01`, etc."
  );

export const auditEventGetInputSchema = z
  .object(scopeQueryShape)
  .superRefine((query, ctx) => scopeQueryRefinement(query, ctx))
  .describe(
    "Which scope to read the event in. Name exactly one of `orgId` or `projectId`."
  );

export const auditEventListResponseSchema = listResponseSchema(
  auditEventList,
  auditEventResponseSchema
);

export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>;
export type AuditEventGetInput = z.infer<typeof auditEventGetInputSchema>;
export type AuditEventListInput = z.infer<typeof auditEventListInputSchema>;
export type AuditEventListResponse = z.infer<
  typeof auditEventListResponseSchema
>;
