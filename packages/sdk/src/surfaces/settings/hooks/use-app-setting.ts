"use client";

import { useMe, useSetMeMetadata } from "../../../react";

import { useSettings } from "../provider";

/**
 * Read + write one setting for the active app, persisted under
 * `apps.<appId>.<key>` in the signed-in user's metadata bag (account scope).
 * Use it inside an app's registered section `Component` — `appId` is resolved
 * from `<Settings>` context (the active "Apps" section), so callers pass only
 * the key:
 *
 *   const { value, set } = useAppSetting<Layout>("layout");
 *   await set(nextLayout); // PUT /me/metadata/apps.<appId>.layout (merge-write)
 */
export function useAppSetting<T>(key: string): {
  value: T | undefined;
  set: (value: T) => Promise<unknown>;
  isPending: boolean;
} {
  const { appId } = useSettings();
  const me = useMe();
  const setMetadata = useSetMeMetadata();

  const apps = (me.data?.metadata?.apps ?? {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const value = appId ? (apps[appId]?.[key] as T | undefined) : undefined;

  const set = (next: T): Promise<unknown> => {
    if (!appId) {
      return Promise.resolve();
    }
    return setMetadata.mutateAsync({
      keyPath: `apps.${appId}.${key}`,
      value: next,
    });
  };

  return { value, set, isPending: setMetadata.isPending };
}
