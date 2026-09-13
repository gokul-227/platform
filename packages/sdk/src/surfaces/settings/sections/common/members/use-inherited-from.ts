"use client";

import type { MemberSource } from "@aec-craft/platform-contracts";

import { useMyStandings } from "../../../../../react";
import { useSettings } from "../../../provider";

/**
 * How to reach where an inherited standing is actually held, or null when this
 * surface cannot get there.
 *
 * There is one destination: a project inherits from the organization above it
 * and from nowhere else. The caller still has to hold `manage` there, because
 * the member list needs it to render and a button that landed them on some
 * other section would have promised the standing could be changed.
 *
 * Reads the standings already fetched for the active scope, so following a
 * reference costs no request.
 */
export function useInheritedFrom(source: MemberSource): (() => void) | null {
  const { orgId, setScope } = useSettings();
  const standings = useMyStandings(orgId);

  if (source !== "inherited") {
    return null;
  }
  const org = standings.data?.items.find(
    (row) => row.groupType === "org" && row.projectId === null
  );
  if (!org?.permits.manage) {
    return null;
  }
  return () => setScope("org", "members");
}
