/**
 * Aggregate of per-module audit-action labels. Mirrors `audit.vocabulary`
 * which aggregates the action maps — same per-module ownership pattern.
 *
 * Lookup is keyed `${resource}.${verb}`; an `AuditEventResponse` from the
 * wire produces the label with `auditActionLabel(action)` below.
 *
 * Each module owns its labels next to its actions
 * (`orgs/org.audit.ts → ORG_AUDIT_ACTION_LABELS`, etc.). Phrasing overrides
 * (`org_invite.created` → "Invite sent") live in the module's file so the
 * domain owner decides the natural wording.
 *
 * Adding a new module: declare `XXX_AUDIT_ACTION_LABELS` in its
 * `*.audit.ts` and spread it here.
 */

import { FILE_AUDIT_ACTION_LABELS } from "../files/file.audit";
import { MEMBER_AUDIT_ACTION_LABELS } from "../tenancy/members/member.audit";
import { ORG_AUDIT_ACTION_LABELS } from "../tenancy/orgs/org.audit";
import { PROJECT_AUDIT_ACTION_LABELS } from "../tenancy/projects/project.audit";

export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> =
  Object.freeze({
    ...ORG_AUDIT_ACTION_LABELS,
    ...PROJECT_AUDIT_ACTION_LABELS,
    ...MEMBER_AUDIT_ACTION_LABELS,
    ...FILE_AUDIT_ACTION_LABELS,
  });

/**
 * Human-readable label for an audit action. Falls back to `"<resource>
 * <verb>"` (e.g. `"org_invite created"`) when the action isn't in the
 * canonical labels map — covers forward-compat for actions that ship
 * before this file catches up.
 */
export function auditActionLabel(action: {
  resource: string;
  verb: string;
}): string {
  return (
    AUDIT_ACTION_LABELS[`${action.resource}.${action.verb}`] ??
    `${action.resource} ${action.verb}`
  );
}
