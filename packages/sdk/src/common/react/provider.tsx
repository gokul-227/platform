"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { PlatformClient } from "../../index";

const Ctx = createContext<PlatformClient | null>(null);

export interface PlatformProviderProps {
  children: ReactNode;
  /**
   * Constructed `PlatformClient` instance. Caller owns base URL + auth-header
   * strategy (e.g. token refresh, dev `X-User-Id` headers). Construct once at
   * the app root and pass in.
   */
  client: PlatformClient;
  /**
   * Optional shared `QueryClient`. If omitted, one is created on first mount —
   * fine for a single SPA, but pass your own if you need to share cache across
   * trees (e.g. SSR hydration) or tune defaults.
   */
  queryClient?: QueryClient;
}

export function PlatformProvider({
  client,
  queryClient,
  children,
}: PlatformProviderProps): ReactNode {
  const qc = useMemo(() => queryClient ?? new QueryClient(), [queryClient]);
  return (
    <QueryClientProvider client={qc}>
      <Ctx.Provider value={client}>{children}</Ctx.Provider>
    </QueryClientProvider>
  );
}

export function usePlatformClient(): PlatformClient {
  const c = useContext(Ctx);
  if (!c) {
    throw new Error(
      "usePlatformClient must be used inside <PlatformProvider>. Wrap your app root with <PlatformProvider client={...}>."
    );
  }
  return c;
}
