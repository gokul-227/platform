import type { GroupStanding, Permit } from "@aec-craft/platform-contracts";
import {
  grantCeiling,
  mayGrant,
  STANDINGS,
} from "@aec-craft/platform-contracts";

/**
 * Which standings this caller may hand out, from the contract's own rule rather
 * than a copy of it.
 *
 * The server refuses anything else with `PERMISSION_ESCALATION_REFUSED`, so a
 * surface offering it is offering a round trip to a refusal it could have
 * predicted. Empty means they may not touch membership at all.
 */
export function grantableStandings(
  permits: Readonly<Partial<Record<Permit, boolean>>>
): readonly GroupStanding[] {
  const ceiling = grantCeiling({
    own: !!permits.own,
    admin: !!permits.admin,
    manage: !!permits.manage,
  });
  if (!ceiling) {
    return [];
  }
  return STANDINGS.filter((standing) => mayGrant(ceiling, standing));
}

/**
 * Whether removing this subject would leave the scope with no owner at all.
 *
 * The same arithmetic the server runs, and the reason it runs on the demotion
 * path as well as the removal one: a partition whose only owner steps down is
 * administrable by nobody, and the person who did it can no longer reach the
 * member list to undo it. Here it only decides which controls are offered; the
 * refusal itself stays on the server.
 *
 * It reads the list it is handed, inherited standings included: an
 * organization's owner owns the project too, so a project's one direct owner
 * was never the last one.
 */
export function isLastOwner(
  members: ReadonlyArray<{ standing: GroupStanding; subject: string }>,
  subject: string
): boolean {
  const owners = members.filter((member) => member.standing === "owner");
  return owners.length === 1 && owners[0]?.subject === subject;
}
