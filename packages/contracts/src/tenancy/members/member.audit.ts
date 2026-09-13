/**
 * Audit actions for membership.
 *
 * These exist because Keto carries no actor, no timestamp and no reason:
 * `Group:acme-mep#editors@fischer` cannot tell you who wrote it or when, so
 * "who made Fischer an editor, and on whose say-so" is unanswerable from the
 * tuple store. The audit row is written in the same transaction as the tuple,
 * and it is the only history either has.
 */
export const MEMBER_AUDIT_ACTIONS = {
  member: ["added", "updated", "removed"],
} as const;

export type MemberAuditResource = keyof typeof MEMBER_AUDIT_ACTIONS;

/** Ordered list of membership audit resources, for a filter dropdown. */
export const MEMBER_AUDIT_RESOURCES: readonly MemberAuditResource[] =
  Object.keys(MEMBER_AUDIT_ACTIONS) as MemberAuditResource[];

export const MEMBER_AUDIT_ACTION_LABELS = {
  "member.added": "Member added",
  "member.updated": "Standing changed",
  "member.removed": "Member removed",
} as const;
