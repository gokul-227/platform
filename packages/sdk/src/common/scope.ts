import type { Scope } from "@aec-craft/platform-contracts";

/**
 * Scope → the query pair a collection takes. How nearly every collection is
 * addressed: a node, a file and an audit event each carry `org_id` and
 * `project_id` and are one table either way, so the partition is a predicate.
 */
export function scopeQuery(scope: Scope): {
  orgId?: string;
  projectId?: string;
} {
  return scope.type === "org"
    ? { orgId: scope.orgId }
    : { projectId: scope.projectId };
}

/**
 * Scope → the owner segment, for the collections that genuinely nest because
 * the row cannot exist without the scope. Members are the only one left
 * (`/orgs/:orgId/members`); a by-id route stays flat either way.
 */
export function scopePath(scope: Scope): string {
  return scope.type === "org"
    ? `/orgs/${encodeURIComponent(scope.orgId)}`
    : `/projects/${encodeURIComponent(scope.projectId)}`;
}
