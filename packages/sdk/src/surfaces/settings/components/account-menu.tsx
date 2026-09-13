"use client";

import { ActiveTag } from "@aec-craft/ui/components/custom/active-tag";
import { AvatarMenu } from "@aec-craft/ui/components/custom/avatar-menu";
import { DropdownMenuItem } from "@aec-craft/ui/components/primitives/dropdown-menu";
import { SquaresFourIcon, UserIcon } from "@aec-craft/ui/icons";
import { useMe } from "../../../react";

import type { SettingsArea } from "../lib/types";

/** Top-right avatar menu → Account / App settings (the per-user scopes). */
export function AccountMenu({
  scope,
  onScope,
  hasApps,
}: {
  scope: SettingsArea;
  onScope: (scope: SettingsArea) => void;
  /** Show the "App settings" entry (only when consumer apps registered sections). */
  hasApps?: boolean;
}) {
  const me = useMe();

  return (
    <AvatarMenu
      align="start"
      email={me.data?.email}
      name={me.data?.name}
      picture={me.data?.picture}
    >
      <DropdownMenuItem onClick={() => onScope("account")}>
        <UserIcon className="size-4" />
        Account settings
        {scope === "account" ? <ActiveTag /> : null}
      </DropdownMenuItem>
      {hasApps ? (
        <DropdownMenuItem onClick={() => onScope("apps")}>
          <SquaresFourIcon className="size-4" />
          App settings
          {scope === "apps" ? <ActiveTag /> : null}
        </DropdownMenuItem>
      ) : null}
    </AvatarMenu>
  );
}
