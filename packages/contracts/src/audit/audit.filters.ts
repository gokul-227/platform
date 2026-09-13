/**
 * Filter spec for `GET /orgs/:orgId/audit` and
 * `GET /projects/:projectId/audit`. Same shape both sides; scope is
 * enforced by the controller, not by these filters.
 *
 * Two-column event model (`resource` + `verb`) opens natural reads:
 *
 *   ?resource=eq.org_member&verb=eq.removed   — every member removal
 *   ?verb=in.(deleted,removed,revoked)        — all destructive events
 *   ?resource=startsWith.org                  — every event in the org family
 *   ?resourceLabel=contains.plans             — every event about a "Plans"
 *
 * `context` is a jsonbPath filter (backed by the GIN index on the column)
 * — `?context->requestId=eq.<id>` correlates all rows from one HTTP call.
 *
 * Sort defaults to `createdAt:desc` server-side; logs read most-recent-first.
 */
import { column, defineFilters, defineListSpec, jsonbPath } from "../query";

export const auditEventFilters = defineFilters({
  actorId: column.string({
    ops: ["eq"],
    description: "Filter by the acting person's platform user id.",
  }),
  actorType: column.string({
    ops: ["eq", "in"],
    description:
      "Filter by actor type (`user` for a person, `service` for a machine, `system` for a platform-internal action).",
  }),
  actorIsStaff: column.boolean({
    ops: ["eq"],
    description:
      "Filter by whether the change came through the staff surface rather than from somebody holding a permit here.",
  }),
  resource: column.string({
    ops: ["eq", "in", "startsWith"],
    description: "Filter by resource type (org, project, org_member, …).",
  }),
  resourceLabel: column.string({
    ops: ["eq", "contains"],
    description:
      "Filter by the subject's recorded name. `contains` is the search a reader types; rows written before the name was recorded hold null and match neither.",
  }),
  resourceId: column.string({
    ops: ["eq"],
    description: "Filter by resource row id.",
  }),
  verb: column.string({
    ops: ["eq", "in"],
    description:
      "Filter by verb (created, updated, deleted, added, removed, …).",
  }),
  createdAt: column.date({
    ops: ["gt", "gte", "lt", "lte"],
    description: "Range filter on created_at (ISO 8601).",
    sortable: true,
  }),
  context: jsonbPath({
    ops: ["hasKey", "eq", "in"],
    description:
      "JSONB-path filter into the transport context (requestId, transport, …).",
  }),
});

/**
 * List contract for the audit feeds: cursor for tailing the log, offset for
 * table views with totals. Default stays cursor so param-less callers keep
 * the original behavior.
 */
export const auditEventList = defineListSpec({
  filters: auditEventFilters,
  pagination: { modes: ["cursor", "offset"], default: "cursor" },
  defaultSort: "createdAt:desc",
});
