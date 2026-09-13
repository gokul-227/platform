"use client";

import { useMe, useSetMeMetadata } from "../../react";

/**
 * Read + write one account-level preference, under `settings.<key>` in the
 * signed-in user's metadata.
 *
 * The sibling of `useAppSetting`, which writes under `apps.<appId>.<key>`: this
 * one is for preferences the settings surface itself owns rather than a
 * consuming app's, so it takes no `appId` and works in every scope.
 */
export function usePreference<T>(
  key: string,
  fallback: T
): { isPending: boolean; set: (value: T) => Promise<unknown>; value: T } {
  const me = useMe();
  const setMetadata = useSetMeMetadata();

  const bag = (me.data?.metadata?.settings ?? {}) as Record<string, unknown>;
  const stored = bag[key] as T | undefined;

  return {
    value: stored ?? fallback,
    set: (next: T) =>
      setMetadata.mutateAsync({ keyPath: `settings.${key}`, value: next }),
    isPending: setMetadata.isPending,
  };
}

/** Preview keys the surface itself reads. Values live under `settings.*`. */
export const PREVIEW_EXPERIMENTS = "showExperiments";
