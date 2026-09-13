"use client";

import { EmptyState } from "@aec-craft/ui/components/blocks/empty-state";
import { SidebarLayout } from "@aec-craft/ui/components/blocks/sidebar-layout";
import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPanel,
  DialogTitle,
  DialogTrigger,
} from "@aec-craft/ui/components/primitives/dialog";
import { LockSimpleIcon, XIcon } from "@aec-craft/ui/icons";
import { type ReactElement, useState } from "react";
import { ScopeBreadcrumb } from "../../common/ui/scope-breadcrumb";
import { SectionLoading } from "../../common/ui/states";
import {
  PREVIEW_EXPERIMENTS,
  usePreference,
} from "../../platform/settings/use-preference";
import { useFlags, useMe, useOrgs } from "../../react";
import { useCallerStanding } from "../../tenancy/react/use-caller-standing";
import { AccountMenu } from "./components/account-menu";
import { orderByGroup, SCOPES, visibleSections } from "./lib/registry";
import type {
  AppConfig,
  Project,
  SectionDef,
  SectionGroupDef,
  SettingsArea,
} from "./lib/types";
import { SettingsProvider, useSettings } from "./provider";

/**
 * Reachable: an organization lists for anyone who can read a project inside it,
 * and holding a standing on the project grants nothing on the organization
 * itself. Selecting it used to leave the pane blank.
 */
function NoAccess() {
  const { scope } = useSettings();
  return (
    <EmptyState
      description="Ask an owner or a manager if you need it."
      icon={LockSimpleIcon}
      title={`You don't have access to this ${scope === "project" ? "project" : "organization"}'s settings.`}
    />
  );
}

const NO_ACCESS_SECTION: SectionDef = {
  id: "no-access",
  label: "Settings",
  icon: LockSimpleIcon,
  Component: NoAccess,
};

export function Settings({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  accountUrl = null,
  orgId: orgIdProp,
  defaultScope = "org",
  defaultProject = null,
  app,
}: {
  /** The identity provider's account page, for fields it owns. */
  accountUrl?: string | null;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the settings modal (rendered as the dialog trigger). */
  trigger?: ReactElement;
  /** Pin a specific organization; defaults to the caller's first org. */
  orgId?: string;
  /** SettingsArea to open at (account / org / project / apps). Defaults to "org".
   *  To re-open at a different scope, remount with a changing `key`. */
  defaultScope?: SettingsArea;
  /** Project to pin when opening at the "project" scope (id + name). */
  defaultProject?: Project | null;
  /** The consuming app's settings (one app per `<Settings>`), under the "Apps" entry. */
  app?: AppConfig;
}) {
  const [scope, setScope] = useState<SettingsArea>(defaultScope);
  const [project, setProject] = useState<Project | null>(defaultProject);
  const [orgId, setOrgId] = useState<string | null>(orgIdProp ?? null);

  // The app's own groups and sections (the "Apps" scope) — account-scoped/self,
  // persisted under apps.<appId>.* via useAppSetting; no permission gate. They
  // lay out like a built-in scope, so the app names its own nav groups.
  const appGroups: readonly SectionGroupDef[] = app?.groups ?? [];
  const appSections: SectionDef[] = orderByGroup(
    app?.sections ?? [],
    appGroups
  );
  const firstSectionId = (target: SettingsArea) =>
    target === "apps"
      ? (appSections[0]?.id ?? "")
      : (SCOPES[target].sections[0]?.id ?? "");

  const [sectionId, setSectionId] = useState<string>(() =>
    firstSectionId(defaultScope)
  );

  // Resolve identity + active org from the API.
  const me = useMe();
  const orgs = useOrgs();
  const activeOrgId = orgId ?? orgs.data?.items[0]?.id ?? null;
  const meSubject = me.data?.id ?? null;
  const projectId = project?.id ?? null;

  const { groupId, permits, ready } = useCallerStanding({
    orgId: activeOrgId,
    projectId,
  });

  const flags = useFlags();
  const previews = {
    experiments: usePreference<boolean>(PREVIEW_EXPERIMENTS, false).value,
    isFlagOn: (key: string) => flags.isEnabled(key),
  };

  // `apps` sections are the registered apps. For built-in scopes, gate by the
  // caller's permits once they resolve (show all until then, so the nav does not
  // flicker).
  let sections: SectionDef[];
  if (scope === "apps") {
    sections = appSections;
  } else if (ready) {
    sections = visibleSections(scope, permits, previews);
  } else {
    // Nav chrome, but no section body yet. Mounting a real section before the
    // permits land fetches on behalf of a caller who may hold nothing here,
    // which is a burst of masked 404s the moment somebody who belongs to one
    // project opens the org they belong to it through.
    sections = SCOPES[scope].sections.map((section) => ({
      ...section,
      Component: SectionLoading,
    }));
  }
  if (ready && scope !== "apps" && sections.length === 0) {
    sections = [NO_ACCESS_SECTION];
  }

  // A section id is passed when the caller is following a reference to where
  // something is held, rather than picking a scope from the nav: landing on that
  // scope's first section would drop them a page away from what they clicked.
  const pickScope = (next: SettingsArea, section?: string) => {
    setScope(next);
    if (next !== "project") {
      setProject(null);
    }
    setSectionId(section ?? firstSectionId(next));
  };
  const selectOrg = (id: string) => {
    setOrgId(id);
    pickScope("org");
  };
  const openProject = (id: string, name: string, section?: string) => {
    setScope("project");
    setProject({ id, name });
    setSectionId(section ?? firstSectionId("project"));
  };

  const active = sections.find((s) => s.id === sectionId) ?? sections[0];

  // Nav headings come from the active scope's own groups.
  const groups = scope === "apps" ? appGroups : SCOPES[scope].groups;
  const groupLabel = (id: string | undefined) =>
    groups.find((group) => group.id === id)?.label;

  return (
    <Dialog defaultOpen={defaultOpen} onOpenChange={onOpenChange} open={open}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogPanel>
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your account, your organization, and its projects.
        </DialogDescription>

        <SettingsProvider
          value={{
            accountUrl,
            scope,
            project,
            orgId: activeOrgId,
            projectId,
            meSubject,
            appId: scope === "apps" ? (app?.appId ?? null) : null,
            groupId,
            permits,
            setScope: pickScope,
            openProject,
          }}
        >
          <SidebarLayout
            activeId={active?.id ?? ""}
            header={
              <>
                <div className="flex min-w-0 items-center gap-1.5">
                  <AccountMenu
                    hasApps={appSections.length > 0}
                    onScope={pickScope}
                    scope={scope}
                  />
                  <ScopeBreadcrumb
                    onOpenProject={openProject}
                    onSelectOrg={selectOrg}
                    orgId={activeOrgId}
                    project={project}
                    scope={scope}
                  />
                </div>
                <DialogClose
                  render={
                    <Button
                      aria-label="Close"
                      className="bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/[0.12] hover:text-foreground"
                      size="icon-sm"
                      variant="secondary"
                    />
                  }
                >
                  <XIcon />
                </DialogClose>
              </>
            }
            onSelect={setSectionId}
            sections={sections.map((section) => ({
              ...section,
              group: groupLabel(section.group),
            }))}
          />
        </SettingsProvider>
      </DialogPanel>
    </Dialog>
  );
}
