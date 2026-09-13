"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { AdminClient } from "../../index";

const Ctx = createContext<AdminClient | null>(null);

export interface AdminProviderProps {
  children: ReactNode;
  /** Constructed `AdminClient`. The caller owns base URL and auth headers. */
  client: AdminClient;
}

/**
 * No `QueryClient` of its own: a console holding both clients shares one cache,
 * so this nests inside `PlatformProvider` rather than starting a second tree.
 */
export function AdminProvider({
  client,
  children,
}: AdminProviderProps): ReactNode {
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}

export function useAdminClient(): AdminClient {
  const client = useContext(Ctx);
  if (!client) {
    throw new Error("useAdminClient must be used inside <AdminProvider>");
  }
  return client;
}
