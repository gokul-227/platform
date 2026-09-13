/**
 * `@aec-craft/platform-sdk/react` — React bindings over `@aec-craft/platform-sdk`.
 *
 * Platform hooks, powered by TanStack Query: wrap your app root with
 * `<PlatformProvider client={...}>`, then call `useOrgs()`, `useCreateOrg()`,
 * etc. from any client component. Queries deduplicate and cache; mutations
 * auto-invalidate the relevant lists and details so views re-fetch without
 * manual wiring.
 *
 * For Server Components: skip the hooks entirely and call the SDK directly —
 * `await platformClient.orgs.list()` — no cache, no loading state, just data.
 *
 *   "use client";
 *   import { useOrgs, useCreateOrg } from "@aec-craft/platform-sdk/react";
 *
 *   function OrgList() {
 *     const orgs = useOrgs();
 *     const createOrg = useCreateOrg();
 *     // ...
 *     createOrg.mutate({ name: "Acme" });
 *   }
 *
 * Agent binding (no TanStack Query): an `AgentProvider` holds the client in
 * context (mirrors `PlatformProvider`); a `ChatProvider` holds one conversation
 * and drives the agent (send / resume / stream), read via `useChat()`. Bring
 * your own UI:
 *
 *   <AgentProvider client={agentClient}>
 *     <ChatProvider scope={{ type: "project", projectId }}>
 *       <MyCommandBar />
 *       <MyChatPanel />
 *     </ChatProvider>
 *   </AgentProvider>
 */

export * from "./analysis/react/analysis.hooks";
export * from "./audit/react/audit.hooks";
export { platformKeys } from "./common/react/keys";
export type { PlatformProviderProps } from "./common/react/provider";
export { PlatformProvider, usePlatformClient } from "./common/react/provider";
export * from "./files/react/file.hooks";
export * from "./files/react/file.index.hooks";
export * from "./graph/react/graph.edge.hooks";
export * from "./graph/react/graph.hooks";
export * from "./graph/react/graph.node.hooks";
export * from "./objects/react/object.hooks";
// Platform seams, under `platform/`: not API domains. A domain has a client, a
// route and a contract type; these have none of the three. The consuming app
// supplies what they read — the flag service's adapter, the tiers a setting
// resolves through — and the SDK only ever reads it back.
export {
  type FlagAdapter,
  flagsOff,
  flagsOn,
  postHogFlags,
  staticFlags,
} from "./platform/flags/flags";
export {
  FlagsProvider,
  useFlag,
  useFlagPayload,
  useFlags,
} from "./platform/flags/react";
export {
  resolveSetting,
  SETTING_TIERS,
  type SettingDef,
  type SettingSource,
  type SettingTier,
} from "./platform/settings/setting";
export { usePreference } from "./platform/settings/use-preference";
export {
  type SettingScope,
  type SettingState,
  useSetting,
} from "./platform/settings/use-setting";
export * from "./tenancy/react/member.hooks";
export * from "./tenancy/react/org.hooks";
export * from "./tenancy/react/project.hooks";
export {
  type CallerStandingState,
  useCallerStanding,
} from "./tenancy/react/use-caller-standing";
export { useMemberNames } from "./tenancy/react/use-member-names";
export {
  AgentProvider,
  type AgentProviderProps,
  useAgentClient,
} from "./threads/react/agent.provider";
export {
  ChatProvider,
  type ChatProviderProps,
  type ChatState,
  type ChatTurn,
  type DebugTurn,
  useChat,
} from "./threads/react/chat";
export * from "./threads/react/thread.hooks";
export * from "./threads/react/thread.message.hooks";
export * from "./threads/react/thread.run.hooks";
export * from "./users/react/me.hooks";
