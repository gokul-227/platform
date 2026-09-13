import type {
  CallerStanding,
  GroupStanding,
  GroupType,
} from "@aec-craft/platform-contracts";
import {
  PlatformError,
  STANDING_RELATIONS,
} from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { eq, inArray, type SQL } from "drizzle-orm";
import { AuthorizationKernelErrors } from "./authorization.errors";
import type { Database } from "./database/database.module";
import { type GroupRow, group, type NewGroupRow } from "./database/schema";
import type { KetoClient } from "./keto/keto.client";
import {
  insert,
  isSubjectTuple,
  parentTuple,
  remove,
  rosterJoinTuples,
  standingTuple,
  subjectStandings,
  type TupleDelta,
} from "./keto/keto.tuples";
import { permitsOn } from "./permit";
import { readableGroups, readableOrgs } from "./readable";

/**
 * The tree itself: the rows, the tuples on them, and the questions a caller
 * asks about both.
 *
 * The other three files answer about a request — where is here, may they, what
 * may they see. This one answers about the store, which is the same store, and
 * it lives here because this package owns it. A resource package that composes
 * a group into its own transaction passes that transaction in.
 */

/**
 * The write surface a partition's create needs, structural so any drizzle
 * database or transaction satisfies it whatever its schema generic. The group
 * and the org row it backs are one fact, so the caller owns the transaction.
 */
export interface GroupWriteExecutor {
  delete(table: typeof group): {
    where(condition: SQL): PromiseLike<unknown>;
  };
  insert(table: typeof group): {
    values(value: NewGroupRow): {
      returning(): PromiseLike<GroupRow[]>;
    };
  };
}

export async function findGroup(
  db: Database,
  groupId: string
): Promise<GroupRow | null> {
  const rows = await db
    .select()
    .from(group)
    .where(eq(group.id, groupId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * A group nobody can name is answered generically. The host's masks are keyed
 * by what a caller asked for — an org, a project — and nothing asks for a group
 * by name any more.
 */
export async function loadGroup(
  db: Database,
  groupId: string
): Promise<GroupRow> {
  const row = await findGroup(db, groupId);
  if (!row) {
    throw new PlatformError(AuthorizationKernelErrors.NOT_FOUND);
  }
  return row;
}

/**
 * Nearest first, from `parent_id`: the tuple mirroring it names a subject set,
 * and Keto answers about subjects rather than enumerating the edge. `seen`
 * catches a cycle the foreign key does not prevent.
 */
export async function ancestorsOf(
  db: Database,
  row: GroupRow
): Promise<GroupRow[]> {
  const chain: GroupRow[] = [];
  const seen = new Set([row.id]);
  let next = row.parentId;
  while (next && !seen.has(next)) {
    seen.add(next);
    const ancestor = await loadGroup(db, next);
    chain.push(ancestor);
    next = ancestor.parentId;
  }
  return chain;
}

/**
 * One Keto call: membership is tuples, and mirroring it into Postgres would be
 * a second copy of the group. Names are the caller's join to make.
 */
export async function subjectsIn(
  keto: KetoClient,
  groupId: string
): Promise<
  Array<{ groupId: string; subject: string; standing: GroupStanding }>
> {
  return subjectStandings(groupId, await keto.list({ object: groupId }));
}

/** The standing a subject holds directly on a group, if any. */
export async function standingOn(
  keto: KetoClient,
  groupId: string,
  subject: string
): Promise<GroupStanding | null> {
  const members = await subjectsIn(keto, groupId);
  return members.find((member) => member.subject === subject)?.standing ?? null;
}

/**
 * Where the subject is placed, not what they reach: reach would let a standing
 * high in one tree vouch for a subject in another.
 */
export async function groupsOf(
  keto: KetoClient,
  subject: string
): Promise<string[]> {
  const tuples = await keto.list({ subjectId: subject });
  return [...new Set(tuples.filter(isSubjectTuple).map((t) => t.object))];
}

/**
 * What makes losing a group's own owner recoverable. Read from each ancestor's
 * tuples, because an `own` check names one subject and the question is whether
 * anyone still owns it after a write that has not happened yet.
 */
export async function hasOwnerAbove(
  db: Database,
  keto: KetoClient,
  row: GroupRow
): Promise<boolean> {
  for (const ancestor of await ancestorsOf(db, row)) {
    const owners = await subjectsIn(keto, ancestor.id);
    if (owners.some((member) => member.standing === "owner")) {
      return true;
    }
  }
  return false;
}

/**
 * The groups whose removal would leave nobody able to administer them, which is
 * what blocks deleting the subject. A group with an owner above it never counts:
 * the tenant can recover that one on its own.
 */
export async function soleOwnerships(
  db: Database,
  keto: KetoClient,
  subject: string
): Promise<Array<{ id: string; name: string }>> {
  const own = await keto.list({
    subjectId: subject,
    relation: STANDING_RELATIONS.owner,
  });
  if (own.length === 0) {
    return [];
  }
  const alone: string[] = [];
  for (const tuple of own) {
    const owners = (await subjectsIn(keto, tuple.object)).filter(
      (member) => member.standing === "owner"
    );
    if (owners.length !== 1) {
      continue;
    }
    // A tuple whose row is gone is the residual state a failed commit leaves,
    // and nothing for somebody to hand over.
    const row = await findGroup(db, tuple.object);
    if (row && !(await hasOwnerAbove(db, keto, row))) {
      alone.push(tuple.object);
    }
  }
  if (alone.length === 0) {
    return [];
  }
  return await db
    .select({ id: group.id, name: group.name })
    .from(group)
    .where(inArray(group.id, alone));
}

/** Called when a profile is deleted, so the store stops naming them. */
export async function revokeAllFor(
  keto: KetoClient,
  subject: string
): Promise<void> {
  const tuples = await keto.list({ subjectId: subject });
  await keto.patch(tuples.map(remove));
}

/**
 * What the caller holds, for a surface deciding its buttons.
 *
 * Naming an organization is optional, and the unscoped form is the one a client
 * reaches for first: it has a token and no ids yet, so a route that demanded an
 * organization could not answer the question it exists to answer. Without one
 * this fans out over the organizations the caller reaches rather than over the
 * table — `readableGroups` fails closed on an empty scope, which is right for a
 * guard and wrong here.
 */
export async function standingsOf(
  db: Database,
  keto: KetoClient,
  principal: Principal,
  orgId?: string
): Promise<CallerStanding[]> {
  const readable = orgId
    ? await readableGroups(db, keto, principal, { orgId })
    : await everyReadableGroup(db, keto, principal);
  if (readable.length === 0) {
    return [];
  }
  const rows = await db
    .select()
    .from(group)
    .where(inArray(group.id, readable))
    .orderBy(group.name);

  return await Promise.all(
    rows.map(async (row) => ({
      groupId: row.id,
      groupName: row.name,
      groupType: row.type as GroupType,
      orgId: row.orgId,
      projectId: row.projectId,
      standing: await standingOn(keto, row.id, principal.subject),
      permits: await permitsOn(keto, principal, row.id),
    }))
  );
}

/** Every group the caller reaches, across every organization they reach. */
async function everyReadableGroup(
  db: Database,
  keto: KetoClient,
  principal: Principal
): Promise<string[]> {
  const orgIds = await readableOrgs(db, keto, principal);
  const perOrg = await Promise.all(
    orgIds.map((orgId) => readableGroups(db, keto, principal, { orgId }))
  );
  return [...new Set(perOrg.flat())];
}

/**
 * Takes the caller's transaction, because the group and the partition row it
 * backs are one fact. Authorization is the caller's too: whoever may create the
 * org may create its group.
 */
export async function createGroup(
  tx: GroupWriteExecutor,
  keto: KetoClient,
  input: {
    orgId: string;
    projectId: string | null;
    parentGroupId: string | null;
    type: "org" | "project" | "custom";
    name: string;
    slug: string;
    /** The first owner. An org's creator; omitted for a project. */
    owner?: string;
  }
): Promise<GroupRow> {
  const inserted = await tx
    .insert(group)
    .values({
      orgId: input.orgId,
      projectId: input.projectId,
      parentId: input.parentGroupId,
      type: input.type,
      name: input.name,
      slug: input.slug,
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    throw new PlatformError(AuthorizationKernelErrors.NOT_FOUND);
  }

  const deltas: TupleDelta[] = [
    ...(input.parentGroupId
      ? [insert(parentTuple(row.id, input.parentGroupId))]
      : []),
    ...(input.owner
      ? [insert(standingTuple(row.id, "owner", input.owner))]
      : []),
    // A project joins the org's roster to itself, so org staff reach it by
    // default. Withholding these is how a restricted project is made.
    ...(input.type === "project" && input.parentGroupId
      ? rosterJoinTuples(row.id, input.parentGroupId).map(insert)
      : []),
  ];
  await keto.patch(deltas);
  return row;
}

/**
 * Takes the caller's transaction, like `createGroup`: rows gone with tuples left
 * behind is a store answering for objects that no longer exist. Children go
 * before parents, so the restrict-on-delete key on `parent_id` holds.
 */
export function deleteOrgTree(
  db: Database,
  tx: GroupWriteExecutor,
  keto: KetoClient,
  orgId: string
): Promise<void> {
  return deleteTree(db, tx, keto, eq(group.orgId, orgId));
}

/** The same, bounded to one project's subtree. */
export function deleteProjectTree(
  db: Database,
  tx: GroupWriteExecutor,
  keto: KetoClient,
  projectId: string
): Promise<void> {
  return deleteTree(db, tx, keto, eq(group.projectId, projectId));
}

async function deleteTree(
  db: Database,
  tx: GroupWriteExecutor,
  keto: KetoClient,
  where: SQL
): Promise<void> {
  const rows = await db.select({ id: group.id }).from(group).where(where);
  if (rows.length === 0) {
    return;
  }
  const tuples = (
    await Promise.all(rows.map((row) => keto.list({ object: row.id })))
  ).flat();
  await tx.delete(group).where(
    inArray(
      group.id,
      rows.map((row) => row.id)
    )
  );
  await keto.patch(tuples.map(remove));
}
