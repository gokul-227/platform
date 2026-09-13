// THE central settings config. One place that declares, per scope (account /
// org / project): the nav groups that scope is divided into, and for each
// section its label + icon + Component + the permission it requires to be
// visible. Section components live in ./sections/{account,org,project,common};
// `visibleSections()` filters by the permits the caller holds on the active
// scope's group, so the nav renders only what they can actually use.
//
// Add a section: create the component under ./sections/<scope|common>, then
// write it (with a `permit`) inside the group it belongs to, in the relevant
// `defineScope` call below.
//
// Only sections that exist are registered. The catalog used to also declare
// what was agreed but unbuilt, each one rendering a placeholder; two thirds of
// it was placeholder, and a published package is the wrong place to keep a
// roadmap. What is planned lives in the tracker.

import type { Permit } from "@aec-craft/platform-contracts";
import {
  BellIcon,
  CreditCardIcon,
  CubeIcon,
  FlaskIcon,
  GearIcon,
  ScrollIcon,
  UserIcon,
  UsersIcon,
} from "@aec-craft/ui/icons";
import { AccountLabsSection } from "../sections/account/labs/labs.section";
import { AccountNotificationsSection } from "../sections/account/notifications/notifications.section";
import { AccountProfileSection } from "../sections/account/profile/profile.section";
import { AuditSection } from "../sections/common/audit/audit.section";
import { MembersSection } from "../sections/common/members/members.section";
import { OrgBillingSection } from "../sections/org/billing/billing.section";
import { OrgGeneralSection } from "../sections/org/general/general.section";
import { OrgProjectsSection } from "../sections/org/projects/projects.section";
import { ProjectGeneralSection } from "../sections/project/general/general.section";

import type {
  ScopeSections,
  SectionDef,
  SectionGroupDef,
  SectionGroupInput,
  SettingsArea,
} from "./types";

/**
 * A scope, authored as groups that own their sections, flattened into the shape
 * the nav renders.
 *
 * Membership and order both come out of the structure: a section sits in the
 * group it is written in, and runs in the order it is written. Nothing points
 * back at a list above it, so there is no id to typo and no adjacency to keep
 * by hand.
 */
function defineScope<const G extends readonly SectionGroupInput[]>(
  groups: G
): ScopeSections<G[number]["id"]> {
  return {
    groups: groups.map(({ id, label }) => ({ id, label })),
    sections: groups.flatMap((group) =>
      group.sections.map((section) => ({ ...section, group: group.id }))
    ),
  };
}

// Account sections are the user's own — always visible (no permission gate).
// Identity/auth concerns (sign-in, sessions, linked providers, account deletion)
// are IdP-owned and live on the auth server's own /account page, not here.
const ACCOUNT = defineScope([
  {
    id: "personal",
    label: "Personal",
    sections: [
      {
        id: "profile",
        label: "Profile",
        icon: UserIcon,
        Component: AccountProfileSection,
      },
      {
        id: "notifications",
        label: "Notifications",
        icon: BellIcon,
        Component: AccountNotificationsSection,
      },
    ],
  },
  {
    id: "developer",
    label: "Developer",
    sections: [
      {
        id: "labs",
        label: "Labs",
        icon: FlaskIcon,
        Component: AccountLabsSection,
      },
    ],
  },
]);

// `permit` is what the caller needs on the active scope. Members reads at
// `read`, like everything else: who else is in a tenant is not a secret from
// the people in it. The controls that change a standing need `manage`, and the
// section hides them without it.
const ORG = defineScope([
  {
    id: "organization",
    label: "Organization",
    sections: [
      {
        id: "general",
        label: "General",
        icon: GearIcon,
        Component: OrgGeneralSection,
        permit: "read",
      },
      {
        id: "projects",
        label: "Projects",
        icon: CubeIcon,
        Component: OrgProjectsSection,
        permit: "admin",
      },
    ],
  },
  {
    id: "access",
    label: "Access",
    sections: [
      {
        id: "members",
        label: "Members",
        icon: UsersIcon,
        Component: MembersSection,
        permit: "read",
      },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    sections: [
      {
        id: "billing",
        label: "Billing",
        icon: CreditCardIcon,
        Component: OrgBillingSection,
        permit: "own",
      },
    ],
  },
  {
    id: "data",
    label: "Data",
    sections: [
      {
        id: "audit",
        label: "Audit",
        icon: ScrollIcon,
        Component: AuditSection,
        permit: "read",
      },
    ],
  },
]);

const PROJECT = defineScope([
  {
    id: "project",
    label: "Project",
    sections: [
      {
        id: "general",
        label: "General",
        icon: GearIcon,
        Component: ProjectGeneralSection,
        permit: "read",
      },
    ],
  },
  {
    id: "access",
    label: "Access",
    sections: [
      {
        id: "members",
        label: "Members",
        icon: UsersIcon,
        Component: MembersSection,
        permit: "read",
      },
    ],
  },
  {
    id: "data",
    label: "Data",
    sections: [
      {
        id: "audit",
        label: "Audit",
        icon: ScrollIcon,
        Component: AuditSection,
        permit: "read",
      },
    ],
  },
]);

/**
 * The root config: per-scope groups and sections. Only the built-in scopes —
 * the `apps` scope's groups and sections come from consumer registration
 * (`<Settings app>`), not this static catalog.
 */
type BuiltinArea = Exclude<SettingsArea, "apps">;

export const SCOPES: Record<BuiltinArea, ScopeSections> = {
  account: ACCOUNT,
  org: ORG,
  project: PROJECT,
};

/**
 * Sections the caller may see in the active built-in scope, in nav order.
 *
 * Account sections are always shown. The rest are gated on the permits the
 * caller holds on that scope's group, which is what `GET /me/standings`
 * resolves; a standing would be the wrong input, because standing reaches a
 * group down the parent chain and an org owner holds none on a project.
 */
export function visibleSections(
  scope: BuiltinArea,
  permits: Readonly<Partial<Record<Permit, boolean>>>,
  previews: { experiments?: boolean; isFlagOn?: (key: string) => boolean } = {}
): SectionDef[] {
  const { groups, sections } = SCOPES[scope];
  const list = sections.filter((section) => {
    if (section.flag && !previews.isFlagOn?.(section.flag)) {
      return false;
    }
    if (section.experimental && !previews.experiments) {
      return false;
    }
    // Account sections are the caller's own, so there is nothing to check.
    return scope === "account" || !section.permit || permits[section.permit];
  });
  return orderByGroup(list, groups);
}

/**
 * Nav order: by the scope's own group order, then declaration order within a
 * group. Ungrouped sorts first, so a section that declares nothing stays put.
 */
export function orderByGroup<S extends { group?: string }>(
  sections: readonly S[],
  groups: readonly SectionGroupDef[]
): S[] {
  const rank = (group: string | undefined) =>
    group === undefined ? -1 : groups.findIndex((g) => g.id === group);
  return [...sections].sort((a, b) => rank(a.group) - rank(b.group));
}
