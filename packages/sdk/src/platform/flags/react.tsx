"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

import { type FlagAdapter, flagsOff } from "./flags";

const FlagsContext = createContext<FlagAdapter>(flagsOff);

/**
 * Provide the flag adapter once, near the app root.
 *
 * Sits above `PlatformProvider` or below it, either way: flags are read
 * synchronously from whatever the adapter already holds, so there is no query
 * and no ordering to get wrong.
 */
export function FlagsProvider({
  adapter,
  children,
}: {
  adapter: FlagAdapter;
  children: ReactNode;
}) {
  return (
    <FlagsContext.Provider value={adapter}>{children}</FlagsContext.Provider>
  );
}

/**
 * Is this flag on?
 *
 * Off when no provider is mounted, so a feature behind a flag stays behind it
 * in an app that has not wired a service.
 */
export function useFlag(key: string): boolean {
  return useContext(FlagsContext).isEnabled(key);
}

/** A flag's payload, for a multivariate flag or a remotely-set value. */
export function useFlagPayload<T>(key: string, fallback: T): T {
  const adapter = useContext(FlagsContext);
  return useMemo(() => {
    const payload = adapter.getPayload?.(key);
    return payload === undefined ? fallback : (payload as T);
  }, [adapter, key, fallback]);
}

/** The adapter itself, for code outside React that already has a reference. */
export function useFlags(): FlagAdapter {
  return useContext(FlagsContext);
}
