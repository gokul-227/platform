import type { Permit } from "@aec-craft/platform-contracts";
import type { ComponentType } from "react";

export type Icon = ComponentType<{ className?: string; size?: number }>;

/**
 * Which area of settings is active. `apps` is the per-user app-settings surface
 * (account-scoped): consumer apps register their own sections, persisted under
 * `apps.<appId>.*` in the signed-in user's metadata bag.
 */
export type SettingsArea = "account" | "org" | "project" | "apps";

/** Project context carried alongside the "project" scope. */
export interface Project {
  id: string;
  name: string;
}

/**
 * One section of the consuming app's settings (sibling of `SectionDef`, no
 * permission gate — app settings are account-scoped/self). The `Component` is
 * the app's own UI; it reads `useSettings()` and persists with
 * `useAppSetting(key)` under `apps.<appId>.<key>`.
 */
export interface AppSectionDef {
  Component: ComponentType;
  /** Id of one of the app's own `groups`. Ungrouped sections sort first. */
  group?: string;
  icon: Icon;
  id: string;
  label: string;
}

/**
 * The consuming app's settings config, passed to `<Settings app={...}>` — one
 * app per `<Settings>` (each product app mounts its own). Its `sections`
 * surface under the "Apps" entry; everything persists under `apps.<appId>.*`.
 */
export interface AppConfig {
  appId: string;
  /**
   * The app's own nav groups, in the order they appear. An app names its
   * settings in its own words, the way each built-in scope does; leaving this
   * empty renders a flat list.
   */
  groups?: readonly SectionGroupDef[];
  sections: AppSectionDef[];
}

/**
 * One entry in a scope's section config. The same Component may appear under
 * several scopes; it reads the active scope from context to adapt.
 *
 * `Group` is the union of the owning scope's group ids, so a typo in `group`
 * is a compile error rather than a section that quietly sorts first.
 */
export interface SectionDef<Group extends string = string> {
  Component: ComponentType;
  /** Shown only to a viewer who has opted into experiments. */
  experimental?: boolean;
  /**
   * Flag key that must be on for this section to appear. A staff switch,
   * where `experimental` is the viewer's own: a section may carry both, and
   * then needs the flag turned on *and* the viewer opted in.
   */
  flag?: string;
  /**
   * Where the section sits in the nav. Derived: a built-in scope authors its
   * sections inside their group and `defineScope` stamps this on the way out,
   * so nothing restates a membership the structure already carries.
   */
  group?: Group;
  icon: Icon;
  id: string;
  label: string;
  /**
   * The permit the caller needs on the active scope's group to see this
   * section. Omit for always-visible sections. Visibility is computed centrally
   * in the registry.
   *
   * One value instead of a `<scope>:<resource>:<action>` string, because there
   * is no per-resource catalog any more: five permits, and each falls through
   * to the one below it.
   */
  permit?: Permit;
}

/**
 * One nav grouping. Each scope declares its own list rather than drawing from a
 * shared vocabulary: a scope's sections are named for what that scope is, so
 * the account scope says "Personal" where the organization says "Organization",
 * and neither has to fit a word chosen for the other.
 *
 * The id stays lowercase because it is an id; the nav shows the label, and
 * leaning on a text-transform to capitalise the id would leave the underlying
 * copy wrong for anything that does not style it.
 */
export interface SectionGroupDef<Id extends string = string> {
  id: Id;
  label: string;
}

/** A scope's nav config: its groups, in order, and the sections that fill them. */
export interface ScopeSections<Group extends string = string> {
  groups: readonly SectionGroupDef<Group>[];
  sections: readonly SectionDef<Group>[];
}

/**
 * How a scope is authored: each group owns the sections in it.
 *
 * The flat form is what the nav renders, and it is derived from this rather
 * than written. Authoring it flat meant every section carried a `group` id
 * pointing back at a list above it, and the order within a group was array
 * adjacency that nothing enforced — a section could sit among another group's
 * and still work, leaving the file saying something untrue.
 */
export interface SectionGroupInput<Id extends string = string> {
  id: Id;
  label: string;
  sections: readonly AuthoredSection[];
}

/** A section as written in a group: everything but the membership it sits in. */
export type AuthoredSection = Omit<SectionDef, "group">;
