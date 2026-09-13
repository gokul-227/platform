"use client";

import type { Permit } from "@aec-craft/platform-contracts";
import { useMemo } from "react";

import { useMyStandings } from "../../users/react/me.hooks";

/**
 * What the caller may do in the active scope, as permits.
 *
 * Permits and not a standing: standing reaches a group down the parent chain,
 * so an org owner administering a project holds `admin` on it without appearing
 * in its membership. A surface keyed on the membership row would hide every
 * control they are entitled to.
 *
 * `ready` is false until the answer arrives. Callers render everything until
 * then rather than nothing, so the nav does not flash empty on first paint.
 */
export interface CallerStandingState {
  /** The group backing the active scope, for a write that names an owner. */
  groupId: string | null;
  permits: Readonly<Partial<Record<Permit, boolean>>>;
  ready: boolean;
}

export function useCallerStanding(scope: {
  orgId: string | null;
  projectId: string | null;
}): CallerStandingState {
  const query = useMyStandings(scope.orgId);

  return useMemo(() => {
    const rows = query.data?.items ?? [];
    // Matched on the partition, not on the first row of the right type: a
    // tenant answers with one row per readable partition, so picking by type
    // alone served the alphabetically-first project's members and permits under
    // every project in the org.
    const active = scope.projectId
      ? rows.find(
          (row) =>
            row.groupType === "project" && row.projectId === scope.projectId
        )
      : rows.find((row) => row.groupType === "org" && row.projectId === null);
    return {
      groupId: active?.groupId ?? null,
      permits: active?.permits ?? {},
      ready: !query.isPending,
    };
  }, [query.data, query.isPending, scope.projectId]);
}
