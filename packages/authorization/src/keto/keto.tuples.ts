import type { GroupStanding, Permit } from "@aec-craft/platform-contracts";
import { STANDING_RELATIONS, STANDINGS } from "@aec-craft/platform-contracts";

/**
 * The tuple vocabulary, so nothing else has to know how a standing is spelled in
 * Keto or that a parent edge is a subject set with an empty relation.
 */

/** The only namespace. The whole model is one. */
export const GROUP_NAMESPACE = "Group";

export interface SubjectSet {
  namespace: string;
  object: string;
  /** Empty string means the object itself rather than a set of its members. */
  relation: string;
}

export interface RelationTuple {
  namespace: string;
  object: string;
  relation: string;
  subject_id?: string;
  subject_set?: SubjectSet;
}

export type TupleDelta =
  | { action: "insert"; relation_tuple: RelationTuple }
  | { action: "delete"; relation_tuple: RelationTuple };

/** `Group:<child>#parent@Group:<parent>`. */
export function parentTuple(
  childGroupId: string,
  parentGroupId: string
): RelationTuple {
  return {
    namespace: GROUP_NAMESPACE,
    object: childGroupId,
    relation: "parent",
    subject_set: {
      namespace: GROUP_NAMESPACE,
      object: parentGroupId,
      relation: "",
    },
  };
}

/** `Group:<group>#<standing>@<subject>`, a person or a service. */
export function standingTuple(
  groupId: string,
  standing: GroupStanding,
  subject: string
): RelationTuple {
  return {
    namespace: GROUP_NAMESPACE,
    object: groupId,
    relation: STANDING_RELATIONS[standing],
    subject_id: subject,
  };
}

/** `Group:<group>#<standing>@(Group:<from>#<fromStanding>)`. */
export function grantTuple(
  groupId: string,
  standing: GroupStanding,
  fromGroupId: string,
  fromStanding: GroupStanding
): RelationTuple {
  return {
    namespace: GROUP_NAMESPACE,
    object: groupId,
    relation: STANDING_RELATIONS[standing],
    subject_set: {
      namespace: GROUP_NAMESPACE,
      object: fromGroupId,
      relation: STANDING_RELATIONS[fromStanding],
    },
  };
}

/**
 * Put a group on a project's roster: every standing of `memberGroupId` becomes a
 * viewer of `projectGroupId`.
 *
 * One tuple per standing, because a subject set names one relation and
 * `#viewers` excludes someone sitting in `#managers`.
 */
export function rosterJoinTuples(
  projectGroupId: string,
  memberGroupId: string
): RelationTuple[] {
  // From STANDINGS: one missed is a tier of the joining group that silently
  // cannot see the project.
  return STANDINGS.map((standing) =>
    grantTuple(projectGroupId, "viewer", memberGroupId, standing)
  );
}

/** What a check asks: does this subject hold this permit on this group. */
export function permitCheck(
  groupId: string,
  permit: Permit,
  subject: string
): RelationTuple {
  return {
    namespace: GROUP_NAMESPACE,
    object: groupId,
    relation: permit,
    subject_id: subject,
  };
}

/** Whether a listed tuple is a person's standing rather than a group's grant. */
export function isSubjectTuple(
  tuple: RelationTuple
): tuple is RelationTuple & { subject_id: string } {
  return typeof tuple.subject_id === "string" && tuple.subject_id.length > 0;
}

/** The standing a listed tuple's relation names, or null if it is `parent`. */
export function standingOfRelation(relation: string): GroupStanding | null {
  for (const [standing, name] of Object.entries(STANDING_RELATIONS)) {
    if (name === relation) {
      return standing as GroupStanding;
    }
  }
  return null;
}

export function insert(relation_tuple: RelationTuple): TupleDelta {
  return { action: "insert", relation_tuple };
}

export function remove(relation_tuple: RelationTuple): TupleDelta {
  return { action: "delete", relation_tuple };
}

/** The people among a group's tuples, with what each of them holds. */
export function subjectStandings(
  groupId: string,
  tuples: readonly RelationTuple[]
): Array<{ groupId: string; subject: string; standing: GroupStanding }> {
  return tuples.filter(isSubjectTuple).flatMap((tuple) => {
    const standing = standingOfRelation(tuple.relation);
    return standing ? [{ groupId, subject: tuple.subject_id, standing }] : [];
  });
}

/**
 * The groups whose viewers reach this one, which is the one grant that adds
 * reach a traversal would not: it decides whether somebody above is on the group
 * or merely above it.
 */
export function viewerJoinSources(
  tuples: readonly RelationTuple[]
): Set<string> {
  const viewers = STANDING_RELATIONS.viewer;
  return new Set(
    tuples.flatMap((tuple) =>
      tuple.relation === viewers &&
      tuple.subject_set?.namespace === GROUP_NAMESPACE &&
      tuple.subject_set.relation === viewers
        ? [tuple.subject_set.object]
        : []
    )
  );
}

/** Every standing a subject could hold on a group, for a delete-then-write. */
export function allStandingTuples(
  groupId: string,
  subject: string
): RelationTuple[] {
  // Derived from STANDINGS, never a literal: one missing from the list survives
  // the delete half of a delete-then-write, so the person holds two.
  return STANDINGS.map((standing) => standingTuple(groupId, standing, subject));
}
