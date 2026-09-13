"use client";

import type { UserResponse } from "@aec-craft/platform-contracts";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aec-craft/ui/components/primitives/avatar";
import { initials } from "@aec-craft/ui/lib/format";

import { useSettings } from "../../../provider";

/**
 * Who you are signed in as, and where to change it.
 *
 * No form. Every field here belongs to the identity provider, whose webhook is
 * their only writer, so a row per field was three labelled inputs nobody could
 * type into and a sentence under each explaining why. The values are the
 * content; showing them once is the whole job.
 */
export function ProfileForm({ me }: { me: UserResponse }) {
  const { accountUrl } = useSettings();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-10">
          {me.picture ? (
            <AvatarImage alt={me.name ?? me.email} src={me.picture} />
          ) : null}
          <AvatarFallback className="text-sm">
            {initials(me.name, me.email)}
          </AvatarFallback>
        </Avatar>
        <div className="text-sm leading-tight">
          <p className="font-medium">{me.name ?? me.email}</p>
          <p className="text-muted-foreground">{me.email}</p>
        </div>
      </div>
      {accountUrl ? (
        // A plain anchor and a new tab: this leaves the app for the identity
        // provider, and a settings modal that navigates away loses whatever
        // else was open in it.
        <p className="text-muted-foreground text-sm">
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href={accountUrl}
            rel="noreferrer"
            target="_blank"
          >
            Manage your account
          </a>{" "}
          to change your name, email or how you sign in.
        </p>
      ) : null}
    </div>
  );
}
