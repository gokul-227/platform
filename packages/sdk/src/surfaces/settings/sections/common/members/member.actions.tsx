"use client";

import type {
  GroupStanding,
  MemberSource,
} from "@aec-craft/platform-contracts";
import { STANDING_LABELS } from "@aec-craft/platform-contracts";
import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@aec-craft/ui/components/primitives/dropdown-menu";
import {
  ArrowRightIcon,
  CheckIcon,
  DotsThreeVerticalIcon,
} from "@aec-craft/ui/icons";

import { useSettings } from "../../../provider";
import { grantableStandings } from "./member.rules";
import { useInheritedFrom } from "./use-inherited-from";

export interface MemberRow {
  email: string | null;
  name: string | null;
  picture: string | null;
  source: MemberSource;
  standing: GroupStanding;
  subject: string;
  /** Null for a subject with no platform user row. */
  userId: string | null;
}

/**
 * Per-row menu: change standing, or remove.
 *
 * Every control here is one the server would accept. Three rules decide that,
 * and each was a refusal somebody could reach before it was applied:
 *
 * - You may only hand out a standing below your own, so a manager is offered
 *   editor and viewer and an owner is offered everything.
 * - Changing what somebody holds also takes away what they held, so acting on
 *   them at all needs the standing they *currently* hold to be within reach
 *   too. Without this a manager could demote an owner, which is a removal the
 *   delete path refuses.
 * - Nobody administers their own standing, so your own row has no menu. The
 *   last-owner rule below covers the case that strands a group outright, and
 *   this is the rest of the same argument: handing ownership over is promoting
 *   the other person, and every other self-change is somebody removing their
 *   own access with the reach that would undo it.
 * - The last owner may be neither demoted nor removed. Not a permission but an
 *   invariant, and the one that stranded a group: its only owner set themselves
 *   to editor, lost `manage` with it, and could no longer reach this menu. It
 *   counts inherited owners too, so a project whose organization has an owner
 *   never has a last one.
 * - An inherited standing is not held here, so there is nothing on this row to
 *   change. The row points at the organization it comes from instead.
 *
 * Refused standings are shown disabled rather than dropped, with the reason
 * under them. A menu that silently shortens gives no way to learn the rule.
 */
export function MemberActionsMenu({
  member,
  isSelf,
  isOnlyOwner,
  onChangeStanding,
  onRemove,
}: {
  isOnlyOwner: boolean;
  isSelf: boolean;
  member: MemberRow;
  onChangeStanding: (standing: GroupStanding) => void;
  onRemove: () => void;
}) {
  const { permits } = useSettings();
  const grantable = grantableStandings(permits);
  const goToSource = useInheritedFrom(member.source);

  if (isSelf) {
    return null;
  }

  // Where the standing lives is where it is changed, so the menu goes there when
  // it can. Said rather than shown as an absent menu when it cannot, since the
  // reason is not the one an empty row usually has.
  if (member.source === "inherited") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Member actions"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <DotsThreeVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {goToSource ? (
            <DropdownMenuItem onClick={goToSource}>
              Change in the organization
              <ArrowRightIcon className="ml-auto size-4" />
            </DropdownMenuItem>
          ) : (
            <p className="px-3 py-2.5 text-muted-foreground text-xs">
              This standing comes from the organization. Change it there.
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // The caller administers no membership at all, or this person stands at or
  // above them.
  if (!grantable.includes(member.standing)) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label="Member actions" size="icon-sm" variant="ghost" />
        }
      >
        <DotsThreeVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Change standing</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {grantable.map((standing) => (
              <DropdownMenuItem
                disabled={isOnlyOwner && standing !== "owner"}
                key={standing}
                onClick={() => onChangeStanding(standing)}
              >
                {STANDING_LABELS[standing]}
                {standing === member.standing ? (
                  <CheckIcon className="ml-auto size-4 text-primary" />
                ) : null}
              </DropdownMenuItem>
            ))}
            {isOnlyOwner ? (
              <>
                <DropdownMenuSeparator />
                {/* Not `DropdownMenuLabel`: it renders base-ui's GroupLabel,
                    which throws outside a `Menu.Group`. */}
                <p className="px-3 py-2.5 text-muted-foreground text-xs">
                  The only owner. Appoint another owner first.
                </p>
              </>
            ) : null}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {isOnlyOwner ? null : (
          <DropdownMenuItem onClick={onRemove} variant="destructive">
            Remove
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
