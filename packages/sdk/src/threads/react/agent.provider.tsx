"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { AgentClient } from "../agent.client";

const Ctx = createContext<AgentClient | null>(null);

export interface AgentProviderProps {
  children: ReactNode;
  /**
   * Constructed `AgentClient` instance. Caller owns base URL + auth-header
   * strategy. Construct once at the app root and pass in. Mirrors
   * `PlatformProvider` (no `QueryClient` here — the agent binding is a
   * stateful controller, not query-cache hooks).
   */
  client: AgentClient;
}

export function AgentProvider({
  client,
  children,
}: AgentProviderProps): ReactNode {
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}

export function useAgentClient(): AgentClient {
  const c = useContext(Ctx);
  if (!c) {
    throw new Error(
      "useAgentClient must be used inside <AgentProvider>. Wrap your app root with <AgentProvider client={...}>."
    );
  }
  return c;
}
