"use client";

import type { Scope } from "@aec-craft/platform-contracts";
import { useMemo } from "react";

import { useMembers } from "./member.hooks";

/**
 * Platform user ids resolved to something readable, for a surface holding an id
 * and no name: an audit actor, the creator of a row.
 *
 * Keyed on `user.id` rather than on the identity subject, because the subject is
 * the identity provider's and changes when the provider does; a name resolved
 * through the platform id survives a swap.
 *
 * The scope's member list is the population: everyone who can act inside a scope
 * reaches it, so anyone who could have written the row is in it. One request per
 * scope, shared by every surface that asks. An id it does not answer for is a
 * machine, a `system` action, or somebody who has since left.
 */
export function useMemberNames(
  scope: Scope | null | undefined
): Map<string, string> {
  const members = useMembers(scope, { pageSize: 200 });
  const items = members.data?.items;

  return useMemo(() => {
    const byId = new Map<string, string>();
    for (const member of items ?? []) {
      if (member.userId) {
        byId.set(member.userId, member.name ?? member.email ?? member.userId);
      }
    }
    return byId;
  }, [items]);
}
