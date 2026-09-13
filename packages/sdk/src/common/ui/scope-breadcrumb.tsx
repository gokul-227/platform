"use client";

import { ScopeSwitcher } from "@aec-craft/ui/components/custom/scope-switcher";
import { useCreateOrg, useOrgs } from "../../tenancy/react/org.hooks";
import {
  useCreateProject,
  useProjectsByOrg,
} from "../../tenancy/react/project.hooks";
import { useMyStandings } from "../../users/react/me.hooks";

/** Scope this breadcrumb is rendered in. `<Settings>`'s own `Scope` is this
 *  union; a surface with only two scopes passes the two it has. */
export type BreadcrumbScope = "account" | "apps" | "org" | "project";

export interface BreadcrumbProject {
  id: string;
  name: string;
}

/** Top-left breadcrumb: organization ▸ project (projects nested in the org).
 *  Shared by the surfaces that switch scope, so they navigate alike. */
export function ScopeBreadcrumb({
  scope,
  project,
  orgId,
  onSelectOrg,
  onOpenProject,
}: {
  scope: BreadcrumbScope;
  project: BreadcrumbProject | null;
  orgId: string | null;
  onSelectOrg: (id: string) => void;
  onOpenProject: (id: string, name: string) => void;
}) {
  const orgs = useOrgs();
  // TODO: first page only, no search — orgs with many projects can't reach
  // the rest from the switcher.
  const projects = useProjectsByOrg(orgId);
  // Account + apps are the per-user scopes: no org/project context, so the org
  // chip is generic and the project chip is hidden.
  const inAccount = scope === "account" || scope === "apps";
  const activeOrg = orgs.data?.items.find((o) => o.id === orgId);

  const createOrg = useCreateOrg();
  const createProject = useCreateProject();

  // Creating a project widens the tree, so it is an `admin` act at the org
  // boundary. Resolved against the org's own group rather than the active
  // scope's, because the switcher is reachable from inside a project.
  const standings = useMyStandings(orgId);
  const canCreateProject =
    standings.data?.items.find((row) => row.groupType === "org")?.permits
      .admin === true;

  return (
    <ScopeSwitcher
      org={{
        label: inAccount
          ? "Organizations"
          : (activeOrg?.name ?? (orgs.isLoading ? "…" : "Organization")),
        menuLabel: "Organizations",
        items: orgs.data?.items ?? [],
        activeId: orgId,
        isLoading: orgs.isLoading,
        emptyText: "No organizations.",
        onSelect: (o) => onSelectOrg(o.id),
        create: {
          entity: "organization",
          canCreate: true,
          onCreate: async ({ name }) => {
            const org = await createOrg.mutateAsync({ name });
            onSelectOrg(org.id);
          },
        },
      }}
      project={
        inAccount
          ? null
          : {
              label:
                scope === "project" ? (project?.name ?? "Project") : "Projects",
              menuLabel: "Projects",
              items: projects.data?.items ?? [],
              activeId: scope === "project" ? project?.id : null,
              isLoading: projects.isLoading,
              emptyText: "No projects yet.",
              onSelect: (p) => onOpenProject(p.id, p.name),
              // No "organization settings" entry. Picking an organization in
              // the chip beside this one already lands there with no project
              // selected, so the item restated a state the breadcrumb was
              // showing and offered a second route to it.
              create: {
                entity: "project",
                canCreate: !!orgId && canCreateProject,
                onCreate: async ({ name }) => {
                  if (!orgId) {
                    return;
                  }
                  const created = await createProject.mutateAsync({
                    orgId,
                    input: { name },
                  });
                  onOpenProject(created.id, created.name);
                },
              },
            }
      }
    />
  );
}
