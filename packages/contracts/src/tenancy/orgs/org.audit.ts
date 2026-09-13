/**
 * Org-module audit actions, declared as a `resource → verb[]` map. The
 * aggregate at `@aec-craft/platform-contracts/audit` merges per-module
 * maps so `AuditService.record({ resource, verb })` type-checks the
 * pair: TS rejects `{ resource: "org", verb: "added" }` because `"added"`
 * isn't in `ORG_AUDIT_ACTIONS.org`. An *action* is the categorical
 * `(resource, verb)`; an *event* is one occurrence of that action.
 *
 * Adding an action: append a verb to an existing resource list, or a new
 * resource with its verbs.
 */
export const ORG_AUDIT_ACTIONS = {
  org: ["created", "updated", "deleted"],
} as const;

export type OrgAuditResource = keyof typeof ORG_AUDIT_ACTIONS;

/** Ordered list of org-scoped audit resources. Derived from
 * `ORG_AUDIT_ACTIONS` so a new resource in the action map auto-appears
 * for any consumer iterating over the org bucket (e.g. the audit page's
 * resource-filter dropdown). */
export const ORG_AUDIT_RESOURCES: readonly OrgAuditResource[] = Object.keys(
  ORG_AUDIT_ACTIONS
) as OrgAuditResource[];

/**
 * Display labels keyed by `${resource}.${verb}`. Mirrors the `OrgErrors`
 * shape (one object per module, consumer composes). Each label is the
 * human-readable past-tense rendering — used by the audit feed in the
 * Platform App and by any SDK consumer that surfaces audit rows.
 *
 * Per-event overrides matter when a default `${noun} ${verb}` reads
 * awkwardly: `org_invite.created` → "Invite sent" (not "Invite created").
 *
 * Adding an action: append a verb to `ORG_AUDIT_ACTIONS` AND a label here.
 * TypeScript catches misses because the aggregate in
 * `audit/audit.labels.ts` requires a label for every action key.
 */
export const ORG_AUDIT_ACTION_LABELS = {
  "org.created": "Organization created",
  "org.updated": "Organization updated",
  "org.deleted": "Organization deleted",
} as const;
