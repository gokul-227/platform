import type { Permit } from "@aec-craft/platform-contracts";

/**
 * A setting, declared once and resolved the same way everywhere.
 *
 * Several product teams read the same handful of conventions — what a length is
 * measured in, where the project's origin sits, how a level is named — and the
 * only way they agree is if there is one declaration and one resolution rule
 * rather than a copy per app.
 *
 * A value is stored in the metadata bag of whichever tier set it, under
 * `settings.<key>`. Nothing new is needed to hold it: organizations, projects
 * and users each already carry a metadata bag with a merge-write endpoint.
 */
export const SETTING_TIERS = ["org", "project", "user"] as const;
export type SettingTier = (typeof SETTING_TIERS)[number];

export interface SettingDef<T> {
  /** Used when no tier has a value. */
  fallback: T;
  /** Dotted path under `settings.` in the tier's metadata bag. */
  key: string;
  /**
   * Which tiers may hold this one, general to specific. Declaring fewer is how
   * a setting says what it is: a project's true north is `["org", "project"]`
   * because no individual gets their own north, and the number of decimals you
   * read it to is `["user"]` because nobody else should decide that for you.
   */
  tiers: readonly SettingTier[];
}

/** Where a resolved value came from. */
export type SettingSource = SettingTier | "fallback";

/**
 * Most specific wins: a person's own choice beats the project's, which beats
 * the organization's. Only tiers the setting declares are consulted, so a
 * value left behind in a bag by a setting that has since narrowed its tiers
 * cannot come back to life.
 */
export function resolveSetting<T>(
  def: SettingDef<T>,
  values: Partial<Record<SettingTier, T | undefined>>
): { source: SettingSource; value: T } {
  // Precedence comes from SETTING_TIERS, not from how the def happens to list
  // them: `tiers: ["user", "org"]` is the same setting as `["org", "user"]`,
  // and reading it off the array would silently invert which one wins.
  for (const tier of [...SETTING_TIERS].reverse()) {
    if (!def.tiers.includes(tier)) {
      continue;
    }
    const value = values[tier];
    if (value !== undefined) {
      return { value, source: tier };
    }
  }
  return { value: def.fallback, source: "fallback" };
}

/**
 * What writing a tier costs. A person's own bag is theirs; the shared tiers are
 * `manage`, the same permit the members surface needs, because a convention
 * everyone works to is administration rather than work.
 */
export const TIER_WRITE_PERMIT: Readonly<
  Record<SettingTier, Permit | undefined>
> = Object.freeze({
  org: "manage",
  project: "manage",
  user: undefined,
});
