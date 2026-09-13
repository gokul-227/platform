import { AuditWriter } from "@aec-craft/platform-audit-api";
import {
  allStandingTuples,
  type GroupRow,
  insert,
  remove,
  standingTuple,
  subjectStandings,
  viewerJoinSources,
} from "@aec-craft/platform-authorization";
import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
import type {
  CreateMemberInput,
  GroupStanding,
  MemberListQuery,
  MemberListResponse,
  MemberResponse,
  MemberSource,
} from "@aec-craft/platform-contracts";
import {
  AuthorizationErrors,
  grantCeiling,
  mayGrant,
  PlatformError,
  standingRank,
} from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import {
  actorLabelForSubject,
  recordedActorId,
  subjectForEmail,
  user,
} from "@aec-craft/platform-users-api";
import { Inject, Injectable } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import { type Database, DatabaseToken } from "../../database/database.module";
import { assertNotSelfStanding } from "./member.assertions";
import { MemberErrors } from "./member.errors";

/** A standing plus whether it is held here or reaches down from above. */
export interface EffectiveMember {
  source: MemberSource;
  standing: GroupStanding;
  subject: string;
}

/**
 * Who is in a partition, and every write that changes it. One service for both
 * scopes: an organization and a project differ only in which group the route
 * resolved, and the standing arithmetic is the same either way.
 *
 * The escalation guard and the audit row live here because a tuple carries
 * neither a ceiling nor an actor. The permit itself does not: `@RequirePermit`
 * has already resolved the scope and refused a caller who may not be here.
 *
 * Profile fields come from a left join to `user` on `external_id`. A member with
 * no row has never signed in, or is a service account, and both are shown as the
 * bare subject rather than hidden.
 */
/**
 * Who is asking, and on what authority. `member` is the ordinary path: the
 * caller holds a permit here and the escalation ceiling is computed from it.
 * `staff` is `admin-api`, which holds nothing here and is authorized by
 * `StaffGuard` instead — the same shape `OrgListScope` uses to say a read
 * spans the estate.
 */
export type MemberActor = { type: "member" } | { type: "staff" };

const AS_MEMBER: MemberActor = { type: "member" };

@Injectable()
export class MemberService {
  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService,
    @Inject(AuditWriter) private readonly audit: AuditWriter
  ) {}

  /**
   * Everyone who reaches the partition, not only the people added to it: a
   * standing traverses the parent chain, so a list of direct members omitted the
   * organization's owner from every project they administer.
   */
  async list(
    groupId: string,
    query: MemberListQuery = {}
  ): Promise<MemberListResponse> {
    const row = await this.checks.loadGroup(groupId);
    const all = await this.listEffective(row);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const members = all.slice((page - 1) * pageSize, page * pageSize);
    const meta = {
      page,
      pageSize,
      total: all.length,
      totalPages: Math.ceil(all.length / pageSize),
    };
    if (members.length === 0) {
      return { items: [], ...meta };
    }
    const profiles = await this.profilesFor(
      members.map((entry) => entry.subject)
    );
    const items = members.map((entry) => ({
      subject: entry.subject,
      standing: entry.standing,
      source: entry.source,
      userId: profiles.get(entry.subject)?.id ?? null,
      email: profiles.get(entry.subject)?.email ?? null,
      name: profiles.get(entry.subject)?.name ?? null,
      picture: profiles.get(entry.subject)?.picture ?? null,
    }));
    return { items, ...meta };
  }

  /**
   * One member, by the subject the roster is keyed on.
   *
   * The same effective set the list walks, so somebody who reaches the partition
   * from above resolves here as they do there. A subject holding nothing answers
   * `MEMBER_NOT_FOUND` rather than a member with no standing, because "not a
   * member" and "a member of no consequence" are different answers.
   *
   * Keyed on the subject and not on `user.id`: that is what the roster tuples
   * carry, and it is what the sibling patch and delete take. A surface holding a
   * stored `user.id` — an audit actor, the creator of a row — reads it off the
   * list instead, which carries both ids.
   */
  async findBySubject(
    groupId: string,
    subjectId: string
  ): Promise<MemberResponse> {
    const row = await this.checks.loadGroup(groupId);
    const entry = (await this.listEffective(row)).find(
      (candidate) => candidate.subject === subjectId
    );
    if (!entry) {
      throw new PlatformError(MemberErrors.NOT_FOUND);
    }
    const profile = (await this.profilesFor([entry.subject])).get(
      entry.subject
    );
    return {
      subject: entry.subject,
      standing: entry.standing,
      source: entry.source,
      userId: profile?.id ?? null,
      email: profile?.email ?? null,
      name: profile?.name ?? null,
      picture: profile?.picture ?? null,
    };
  }

  /**
   * Its own tuples, plus the standings above it that traverse down. An org owner
   * has no tuple on a project and administers it regardless, so a list of tuples
   * alone omits the person with the most authority over the row.
   *
   * A viewer above is the one standing that does not simply fall down the tree:
   * `read` traverses the parent's `write`, which never admits a viewer. What
   * carries them into a project is the roster join written when it was made, so
   * an organization's viewers are listed only when the project admits them.
   *
   * The strongest standing wins and direct beats an equal inherited one. One
   * Keto call per group in the chain.
   */
  async listEffective(row: GroupRow): Promise<EffectiveMember[]> {
    const tuples = await this.checks.tuplesOn(row.id);
    const admitsViewersOf = viewerJoinSources(tuples);
    const found = new Map<string, EffectiveMember>();
    for (const member of subjectStandings(row.id, tuples)) {
      found.set(member.subject, {
        source: "direct",
        standing: member.standing,
        subject: member.subject,
      });
    }
    for (const ancestor of await this.checks.ancestorsOf(row)) {
      for (const member of await this.checks.subjectsIn(ancestor.id)) {
        if (member.standing === "viewer" && !admitsViewersOf.has(ancestor.id)) {
          continue;
        }
        const held = found.get(member.subject);
        if (
          held &&
          standingRank(held.standing) <= standingRank(member.standing)
        ) {
          continue;
        }
        found.set(member.subject, {
          source: "inherited",
          standing: member.standing,
          subject: member.subject,
        });
      }
    }
    return [...found.values()];
  }

  /**
   * An email is resolved against a profile rather than taken on trust: a
   * standing written against an address nobody has signed in with is a standing
   * nobody holds, sitting in the list looking granted.
   */
  async add(
    principal: Principal,
    groupId: string,
    input: CreateMemberInput,
    actor: MemberActor = AS_MEMBER
  ): Promise<void> {
    const subject = await this.resolveSubject(input);
    return await this.setStanding(
      principal,
      groupId,
      subject,
      input.standing,
      actor
    );
  }

  /**
   * Delete-then-write for both adding and promoting, in one Keto call. Writing
   * `editor` without removing `viewer` leaves the person holding both, which
   * reads as a promotion that did not take.
   */
  async setStanding(
    principal: Principal,
    groupId: string,
    subject: string,
    standing: GroupStanding,
    actor: MemberActor = AS_MEMBER
  ): Promise<void> {
    const row = await this.checks.loadGroup(groupId);
    await this.assertMayGrant(principal, row.id, standing, actor);

    const members = await this.checks.subjectsIn(row.id);
    const current =
      members.find((member) => member.subject === subject)?.standing ?? null;
    if (current) {
      if (actor.type === "member") {
        assertNotSelfStanding(principal, subject);
      }
      // Changing what somebody holds also takes away what they held, so it
      // needs the ceiling the removal path applies. Without it a manager
      // demotes an owner to viewer, which is a removal spelled as an update.
      await this.assertMayGrant(principal, row.id, current, actor);
      await this.assertOwnerRemains(row, members, subject, standing);
    }
    const actorId = await recordedActorId(this.db, principal);
    // The subject is the identity provider's and means nothing to a person
    // reading the log; null is a service account, which has no name to give.
    const target = await actorLabelForSubject(this.db, subject);
    await this.db.transaction(async (tx) => {
      await this.audit.record(tx, {
        resource: "member",
        verb: current ? "updated" : "added",
        label: target.label,
        resourceId: target.id ?? row.id,
        groupId: row.id,
        orgId: row.orgId,
        projectId: row.projectId,
        actorId,
        actorType: principal.type,
        actorIsStaff: actor.type === "staff",
        // `current` is null on an add: an `after` and no `before`.
        payload: {
          userId: target.id,
          ...(current ? { before: { standing: current } } : {}),
          after: { standing },
        },
      });
      await this.checks.patchTuples([
        ...allStandingTuples(row.id, subject).map(remove),
        insert(standingTuple(row.id, standing, subject)),
      ]);
    });
  }

  /**
   * Refuses to strand the partition: one with no owner of its own and none above
   * it can be administered by nobody. Only a direct standing can be taken away,
   * so removing somebody who reaches a project from the organization is a
   * missing member rather than a refusal.
   */
  async remove(
    principal: Principal,
    groupId: string,
    subject: string,
    actor: MemberActor = AS_MEMBER
  ): Promise<void> {
    const row = await this.checks.loadGroup(groupId);
    const members = await this.checks.subjectsIn(row.id);
    const removed = members.find((member) => member.subject === subject);
    if (!removed) {
      throw new PlatformError(MemberErrors.NOT_FOUND);
    }
    if (actor.type === "member") {
      assertNotSelfStanding(principal, subject);
    }
    await this.assertMayGrant(principal, row.id, removed.standing, actor);
    await this.assertOwnerRemains(row, members, subject, null);

    const actorId = await recordedActorId(this.db, principal);
    const target = await actorLabelForSubject(this.db, subject);
    await this.db.transaction(async (tx) => {
      await this.audit.record(tx, {
        resource: "member",
        verb: "removed",
        label: target.label,
        resourceId: target.id ?? row.id,
        groupId: row.id,
        orgId: row.orgId,
        projectId: row.projectId,
        actorId,
        actorType: principal.type,
        actorIsStaff: actor.type === "staff",
        payload: { userId: target.id, before: { standing: removed.standing } },
      });
      await this.checks.patchTuples(
        allStandingTuples(row.id, subject).map(remove)
      );
    });
  }

  /**
   * The join is on `user.external_id`, which mirrors the identity id the token
   * asserts, and it is a left join in spirit: a subject with no row is still a
   * member.
   */
  private async profilesFor(subjects: string[]): Promise<
    Map<
      string,
      {
        email: string;
        id: string;
        name: string | null;
        picture: string | null;
      }
    >
  > {
    if (subjects.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        id: user.id,
        externalId: user.externalId,
        email: user.email,
        name: user.name,
        picture: user.picture,
      })
      .from(user)
      .where(inArray(user.externalId, subjects));
    return new Map(
      rows.flatMap((row) =>
        row.externalId
          ? [
              [
                row.externalId,
                {
                  id: row.id,
                  email: row.email,
                  name: row.name,
                  picture: row.picture,
                },
              ] as const,
            ]
          : []
      )
    );
  }

  /**
   * Matched case-insensitively: a person types their own email however they
   * please and the store holds whatever the provider sent. A row with no
   * `external_id` is a profile no identity has claimed, so it is nobody to grant
   * a standing to.
   */
  private async resolveSubject(input: CreateMemberInput): Promise<string> {
    if (input.subject) {
      return input.subject;
    }
    const subject = await subjectForEmail(this.db, input.email ?? "");
    if (!subject) {
      throw new PlatformError(MemberErrors.EMAIL_UNKNOWN);
    }
    return subject;
  }

  /**
   * A partition nobody can own is one nobody can administer. It binds on a
   * demotion exactly as on a removal, because the only owner could set
   * themselves to editor, lose `manage` with it, and no longer reach the list to
   * put it back.
   *
   * Ownership above satisfies it: `own` traverses the parent, so counting direct
   * owners alone refused removals over an invariant that was never in danger.
   * What is left is the unrecoverable case, a partition with no owner above it
   * whose last owner is going.
   *
   * `next` is the standing they end up holding, or null when they hold none.
   */
  private async assertOwnerRemains(
    row: GroupRow,
    members: ReadonlyArray<{ standing: GroupStanding; subject: string }>,
    subject: string,
    next: GroupStanding | null
  ): Promise<void> {
    if (next === "owner") {
      return;
    }
    const remains = members.some(
      (member) => member.standing === "owner" && member.subject !== subject
    );
    if (remains || (await this.checks.hasOwnerAbove(row))) {
      return;
    }
    throw new PlatformError(MemberErrors.LAST_OWNER);
  }

  /**
   * Runs immediately before every tuple write. The ceiling comes from the
   * permits the caller holds here and not from a membership row: an org owner
   * administering a project holds `admin` on it without appearing in its owners.
   */
  private async assertMayGrant(
    principal: Principal,
    groupId: string,
    target: GroupStanding,
    actor: MemberActor
  ): Promise<void> {
    // Staff hold nothing here, so there is no ceiling to compare against and
    // every grant would refuse. This surface exists to repair a tenant that
    // cannot repair itself — a partition that has lost its last owner most of
    // all — so it grants any standing and the audit row says it was us.
    // `assertOwnerRemains` still applies: nothing may strand a partition.
    if (actor.type === "staff") {
      return;
    }
    const permits = await this.checks.permitsOn(principal, groupId);
    const ceiling = grantCeiling(permits);
    if (!ceiling) {
      throw new PlatformError(AuthorizationErrors.FORBIDDEN);
    }
    if (!mayGrant(ceiling, target)) {
      throw new PlatformError(AuthorizationErrors.ESCALATION_REFUSED);
    }
  }
}
