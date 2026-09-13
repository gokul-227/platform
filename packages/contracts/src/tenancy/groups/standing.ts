/**
 * The whole authorization vocabulary: five standings, five permits, and the
 * rule for who may hand out which.
 *
 * A group is a set of users. A standing is which relation that set holds. The
 * breadth of what they hold it over is the only difference between "owner of
 * the org" and "editor at Acme MEP", so there is no role table and no
 * permission catalog.
 *
 * `standing`, never `role`: it is the spec's word, it does not collide with the
 * identity estate's `staffRole`, and it stops anyone reaching for the old role
 * vocabulary out of muscle memory.
 */

import { z } from "zod";

/**
 * The five standings, highest first. Position in this array is the ladder, so
 * inserting one changes who may grant whom.
 */
export const STANDINGS = [
  "owner",
  "admin",
  "manager",
  "editor",
  "viewer",
] as const;

export const standingSchema = z
  .enum(STANDINGS)
  .describe(
    "What a subject holds on a group. `owner` answers for the tenant itself, `admin` runs everything inside it, `manager` administers membership and locks, `editor` does the work, `viewer` reads. Each falls through to the one below, so an owner needs no editor grant to write."
  );

export type GroupStanding = z.infer<typeof standingSchema>;

/**
 * The Keto relation each standing is stored as. Keto's relations are sets of
 * subjects and read plural in a tuple (`Group:acme-mep#editors@fischer`), while
 * a field holding one value reads singular (`standing: "editor"`).
 *
 * So there is a mapping, and this is deliberately the only one: it is
 * mechanical, total, and stated here next to the values it pairs, rather than
 * hidden in whichever client happens to write the tuple.
 */
export const STANDING_RELATIONS: Readonly<Record<GroupStanding, string>> =
  Object.freeze({
    owner: "owners",
    admin: "admins",
    manager: "managers",
    editor: "editors",
    viewer: "viewers",
  });

/**
 * The five permits the OPL computes. Each covers the standings above its floor,
 * so a manager needs no viewer tuple to read.
 *
 * All five traverse to the parent group, which is what makes "staff reach
 * everything beneath them" fall out of the model rather than being a bypass.
 *
 * `read` traverses the parent's `write`, not the parent's `read`, and the
 * asymmetry is load-bearing. A project's viewers is where every contractor's
 * roster join lands, so following read upward arrives in a set fed by the
 * children and comes back down into every sibling, making one contractor's
 * private work readable by another with no share ever granted. Write never
 * admits a viewer, so traversing it carries staff down and nobody sideways.
 * The consequence to know: read descends for editors and above, not for a pure
 * viewer, and visibility between peers stays the explicit share.
 *
 * The OPL spells each permit as a union of relations plus one traversal, never
 * as a call to the permit above it. Keto spends expansion budget per link, so a
 * ladder costs a level of reach per rung and silently produces an owner who can
 * administer what they cannot write.
 */
export const PERMITS = ["read", "write", "manage", "admin", "own"] as const;

export const permitSchema = z
  .enum(PERMITS)
  .describe(
    "`read` sees the group's rows, `write` mutates them (update and delete alike), `manage` covers membership and locks, `admin` covers the lifecycle of what sits inside the tenant, `own` covers the tenant's own existence and its bill."
  );

export type Permit = z.infer<typeof permitSchema>;

/** The lowest standing that satisfies each permit on the group it is held on. */
export const PERMIT_FLOOR: Readonly<Record<Permit, GroupStanding>> =
  Object.freeze({
    read: "viewer",
    write: "editor",
    manage: "manager",
    admin: "admin",
    own: "owner",
  });

/** Display label per standing, so every surface renders the same word. */
export const STANDING_LABELS: Readonly<Record<GroupStanding, string>> =
  Object.freeze({
    owner: "Owner",
    admin: "Administrator",
    manager: "Manager",
    editor: "Editor",
    viewer: "Viewer",
  });

/**
 * Position on the ladder: 0 is `owner`. A lower number is a higher standing,
 * which reads backwards and is the honest spelling of "first in the list wins".
 */
export function standingRank(standing: GroupStanding): number {
  return STANDINGS.indexOf(standing);
}

/**
 * What a subject may hand out on a group, derived from the permits they hold
 * there rather than from a membership row: standing reaches a group through the
 * parent chain, so an org owner administering a contractor group holds `admin`
 * on it without appearing in its owners.
 *
 * `null` means they may not touch membership at all. Editors and viewers never
 * can, so the two permits below are the whole question and no membership read is
 * needed to answer it.
 */
export type GrantCeiling = "any" | "belowOwner" | "belowManager";

export function grantCeiling(permits: {
  admin: boolean;
  manage: boolean;
  own: boolean;
}): GrantCeiling | null {
  if (permits.own) {
    return "any";
  }
  if (permits.admin) {
    return "belowOwner";
  }
  if (permits.manage) {
    return "belowManager";
  }
  return null;
}

/**
 * You may only grant strictly below your own standing, so the administration
 * chain deepens only by a decision from above it: a manager hands out `editor`
 * and `viewer` and never another manager.
 *
 * An owner is the documented exception and may appoint a peer. Somebody has to
 * be able to, or an org created with one owner could never gain a second and
 * ownership transfer would need an operation outside this rule to exist at all.
 *
 * An admin appointing another admin falls out of the rule rather than being a
 * second exception: `admin` is strictly below `owner`. It has to work, because
 * the case the tier exists for is an owner who is not in the building — if
 * every new admin needed them, the absence they were meant to cover would be
 * the thing blocking it.
 */
export function mayGrant(
  ceiling: GrantCeiling,
  target: GroupStanding
): boolean {
  if (ceiling === "any") {
    return true;
  }
  const floor = ceiling === "belowOwner" ? "owner" : "manager";
  return standingRank(target) > standingRank(floor);
}
