import type { AuditAction } from "@aec-craft/platform-contracts";
import { Injectable } from "@nestjs/common";

import { auditEvent } from "./audit.event.table";

/**
 * The write half of this package. A writing slice imports it and provides it in
 * its own module; the authorization kernel used to hand it out globally, which
 * put a table in the one package that owns no resource.
 */

/**
 * The insert surface `record` needs: any drizzle database or transaction can
 * satisfy it structurally, regardless of its own schema generic. Callers pass
 * the transaction of their canonical write so the audit row commits or rolls
 * back with it.
 */
export interface AuditWriteExecutor {
  insert(table: typeof auditEvent): {
    values(value: typeof auditEvent.$inferInsert): PromiseLike<unknown>;
  };
}

/**
 * What a payload says, in one shape across every slice.
 *
 * `before` and `after` hold the state that moved, and a reader diffs them
 * without knowing the resource: a create carries only `after`, a delete only
 * `before`, an edit both. Everything else is a fact about the event rather than
 * a change (which metadata key, which subject) and sits alongside them.
 *
 * The alternative is what this replaced, and it is the reason the shape is
 * stated here: a writer naming the old value `previousStanding` beside
 * `standing` records exactly the same thing, and nothing generic can pair the
 * two, so the change renders as a list of fields while the one next to it
 * renders as a diff.
 */
export interface AuditPayload extends Record<string, unknown> {
  after?: Record<string, unknown>;
  before?: Record<string, unknown>;
}

/**
 * Audit log writer (`record`). Internal to the service layer — never exposed
 * on the wire; the read feeds are this package's controllers.
 *
 * Type safety: `record` accepts an `AuditAction` — a discriminated union of
 * every valid `(resource, verb)` pair across the per-module event maps.
 * TypeScript catches `{ resource: "org", verb: "added" }` at compile time
 * because `"added"` isn't a verb on `org`.
 *
 * Note: per-request correlation (requestId, ip, userAgent, clientId) is NOT
 * captured today; the `context` column stays for when it's wired back in.
 */
@Injectable()
export class AuditWriter {
  async record(
    tx: AuditWriteExecutor,
    event: AuditAction & {
      resourceId: string;
      /**
       * What this event is about, as a reader would name it: `plan.ifc`, `Marius
       * Bauer`. Required, because a row without it says the shape of what
       * happened and never its subject, and it cannot be resolved later: the
       * name is recorded as it was, and half these events remove the row that
       * held it.
       */
      label: string;
      orgId?: string | null;
      projectId?: string | null;
      /**
       * Required, because every reader filters on it. `groupWhereReadable`
       * matches with `IN (...)`, which a null never satisfies, so a row written
       * without one is stored and then invisible to everybody — the worst
       * shape for an audit log, since nothing looks broken until somebody goes
       * looking for an event that was recorded and cannot be found.
       */
      groupId: string;
      /** From `recordedActorId`, never `principal.subject` directly. */
      actorId: string | null;
      actorType: string;
      /** True only from `/admin/*`; see the column's own note. */
      actorIsStaff?: boolean;
      payload?: AuditPayload | null;
      /** Free-form correlation bag. Empty for v1. */
      context?: Record<string, unknown>;
    }
  ): Promise<void> {
    await tx.insert(auditEvent).values({
      orgId: event.orgId ?? null,
      projectId: event.projectId ?? null,
      groupId: event.groupId,
      actorId: event.actorId,
      actorType: event.actorType,
      actorIsStaff: event.actorIsStaff ?? false,
      resource: event.resource,
      resourceId: event.resourceId,
      resourceLabel: event.label,
      verb: event.verb,
      context: event.context ?? {},
      payload: event.payload ?? null,
    });
  }
}
