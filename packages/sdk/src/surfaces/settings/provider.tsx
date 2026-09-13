"use client";

import type { Permit } from "@aec-craft/platform-contracts";
import { createContext, type ReactNode, useContext } from "react";

import type { Project, SettingsArea } from "./lib/types";

interface SettingsContextValue {
  /** Active app id when scope is "apps" (the registered section's appId), else null. */
  /**
   * Where the identity provider's own account page lives, so a field it owns
   * can point at the one place that can change it. Null when the host has not
   * said, and the copy falls back to naming the provider without linking.
   */
  accountUrl: string | null;
  appId: string | null;
  /** The group backing the active scope. Members and grants hang off it. */
  groupId: string | null;
  /** The caller's own subject, as the gateway asserts it. */
  meSubject: string | null;
  /** Jump into a project's settings, landing on `sectionId` when given. */
  openProject: (id: string, name: string, sectionId?: string) => void;
  /** Active organization id (resolved from props or the org switcher). */
  orgId: string | null;
  /** What the caller may do on that group. Drives which controls exist. */
  permits: Readonly<Partial<Record<Permit, boolean>>>;
  /** The project in context when scope is "project" (else null). */
  project: Project | null;
  /** Active project id (when scope is "project"). */
  projectId: string | null;
  scope: SettingsArea;
  /** Switch scope, landing on `sectionId` or the new scope's first section. */
  setScope: (scope: SettingsArea, sectionId?: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  value,
  children,
}: {
  value: SettingsContextValue;
  children: ReactNode;
}) {
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within <Settings>.");
  }
  return ctx;
}
