import { and, eq, isNotNull, sql } from "drizzle-orm";
import { user } from "./user.table";

/** The select surface these lookups need, satisfied by any drizzle tx. */
export interface ActorReadExecutor {
  select<F extends Record<string, unknown>>(
    fields: F
  ): {
    from(table: typeof user): {
      where(condition: unknown): {
        limit(
          count: number
        ): PromiseLike<Array<{ [K in keyof F]: string | null }>>;
      };
    };
  };
}

/** The half of a principal an actor column records. */
export interface ActorPrincipal {
  readonly subject: string;
  readonly type: string;
}

/**
 * The `user.id` to record for whoever is acting, or null.
 *
 * The platform's own id and not the asserted subject, because the subject
 * belongs to the identity provider and changes when the provider does: a swap
 * rewrites `user.external_id`, and every row that stored the old subject would
 * be left naming somebody nothing claims.
 *
 * Null is an ordinary answer. A `system` action has no actor, a machine has a
 * client id rather than a profile, and a person whose provider hook has not
 * fired yet has no row. `actor_type` beside it says which, and a second column
 * for a machine's own id can land when there is a machine to name — there is
 * none today, since an agent acts through the person who asked it.
 *
 * No foreign key anywhere these land. A row recording who acted has to outlive
 * the account it names: a cascade would erase the actor, and a restraint would
 * block the very deletion the row exists to record.
 *
 * Call it before opening the transaction it feeds. The lookup is not
 * transactional, and a read lock on `user` held for the life of every audited
 * write is what made a parallel TRUNCATE wait on it.
 */
export async function recordedActorId(
  tx: ActorReadExecutor,
  principal: ActorPrincipal
): Promise<string | null> {
  if (principal.type !== "user") {
    return null;
  }
  return await userIdForSubject(tx, principal.subject);
}

/**
 * The `user.id` behind any subject, for naming somebody who is not the caller.
 *
 * An audit payload that records who was added to a group has the same problem
 * the actor column had: a subject is the identity provider's, so it neither
 * survives a swap nor means anything to a person reading the log. Null when the
 * subject has no profile, which is a service account or somebody who has not
 * signed in yet.
 */
export async function userIdForSubject(
  tx: ActorReadExecutor,
  subject: string
): Promise<string | null> {
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.externalId, subject))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * The identity subject behind an address, for a surface that names a person by
 * email rather than by the identity provider's id — which nobody administering
 * a tenant knows.
 *
 * Null when nobody has signed in with it: an address is not an account until
 * the provider has seen it, and inventing one here would create a standing
 * nobody can use. Compared case-insensitively, because a mailbox is.
 */
export async function subjectForEmail(
  tx: ActorReadExecutor,
  email: string
): Promise<string | null> {
  const rows = await tx
    .select({ externalId: user.externalId })
    .from(user)
    .where(
      and(
        sql`lower(${user.email}) = ${email.trim().toLowerCase()}`,
        isNotNull(user.externalId)
      )
    )
    .limit(1);
  return rows[0]?.externalId ?? null;
}

/**
 * Who a subject is, for an audit row that has to name them: their id, and the
 * best name the platform holds.
 *
 * The name is recorded rather than joined later, because the row it describes
 * outlives the account — a deletion is exactly the event whose subject can no
 * longer be looked up. It falls back to the email and then to the subject, so a
 * label is always something a reader recognises.
 */
export async function actorLabelForSubject(
  tx: ActorReadExecutor,
  subject: string
): Promise<{ id: string | null; label: string }> {
  const rows = await tx
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(eq(user.externalId, subject))
    .limit(1);
  const row = rows[0];
  return {
    id: row?.id ?? null,
    label: row?.name || row?.email || subject,
  };
}
