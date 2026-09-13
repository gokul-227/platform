/**
 * Aggregate of per-module audit-action maps. Each module owns its
 * `resource → verb[]` shape (`orgs/org.audit.ts`,
 * `projects/project.audit.ts`, `users/user.audit.ts`); this file flattens
 * them into one map so `AuditService.record({ resource, verb })`
 * type-checks the pair.
 *
 * Terminology: an *action* is the `(resource, verb)` pair — categorical,
 * finite (e.g. `project.created`). An *event* is one instance of an
 * action happening (one row in `audit_event`) carrying actor + timestamp +
 * payload + scope; the wire shape lives in `AuditEventResponse`.
 *
 * Adding a new module: declare its `*.audit.ts` map + spread it in here.
 * Two-line change.
 *
 * Not aggregated: graph mutations. Those get a separate, richer
 * **domain-history** table (`node_change` / `edge_change`, future PLT)
 * that captures the actual data delta. The audit log would only duplicate
 * `(who, when)` of those rows at 100× the volume.
 */

import { FILE_AUDIT_ACTIONS } from "../files/file.audit";
import { MEMBER_AUDIT_ACTIONS } from "../tenancy/members/member.audit";
import { ORG_AUDIT_ACTIONS } from "../tenancy/orgs/org.audit";
import { PROJECT_AUDIT_ACTIONS } from "../tenancy/projects/project.audit";

export const AUDIT_ACTIONS = {
  ...ORG_AUDIT_ACTIONS,
  ...PROJECT_AUDIT_ACTIONS,
  ...MEMBER_AUDIT_ACTIONS,
  ...FILE_AUDIT_ACTIONS,
} as const;

export type AuditResource = keyof typeof AUDIT_ACTIONS;

/**
 * Discriminated union of valid `(resource, verb)` pairs. Used as the
 * input type for `AuditService.record` so TS catches `{ resource: "org",
 * verb: "added" }` at compile time — `"added"` isn't in the `org` verbs.
 */
export type AuditAction = {
  [K in AuditResource]: {
    resource: K;
    verb: (typeof AUDIT_ACTIONS)[K][number];
  };
}[AuditResource];

/**
 * Actor type — an independent dimension, not paired with the event.
 *
 * The first two are the token's own distinction, copied rather than translated:
 * `user` is a person, `service` is a machine, and the verifier decides which by
 * whether the token's subject is the client holding it. `system` is the one
 * value it cannot supply, because it describes an action with no caller at all
 * (a worker, a migration, a scheduled sweep).
 *
 * This used to be four values, splitting `agent` and `service-account` out of
 * `service`. Both were the same fact to every reader, neither was ever derivable
 * from a token, and keeping them meant two vocabularies for one thing.
 */
export const CANONICAL_ACTOR_TYPES = ["user", "service", "system"] as const;
export type CanonicalActorType = (typeof CANONICAL_ACTOR_TYPES)[number];
