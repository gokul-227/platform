import { PlatformError, ValidationErrors } from "@aec-craft/platform-contracts";
import slugify from "slugify";

/**
 * Slug shape — lowercase alphanumeric with single dashes, 1-64 chars, no
 * leading or trailing dash. Mirrors the output of `makeSlug` exactly so DTO
 * validators stay in sync.
 *
 * Linear-time bounded class; the optional `{0,62}` group does not cause
 * catastrophic backtracking.
 */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** Slugify a free-form string — lowercased, dash-separated, diacritic-stripped. */
export function makeSlug(input: string): string {
  return slugify(input, { lower: true, strict: true, trim: true }).slice(0, 64);
}

const SUFFIX_RE = /-(\d+)$/;

/**
 * If `base` is taken, append `-2`, `-3`, … until `isAvailable(candidate)` is
 * true. Avoids the race of "insert + catch unique violation + retry" by
 * resolving the slug before the insert.
 */
export async function uniqueSlug(
  base: string,
  isAvailable: (candidate: string) => Promise<boolean>
): Promise<string> {
  const root = base.replace(SUFFIX_RE, "");
  let suffix = 1;
  let candidate = base;
  while (!(await isAvailable(candidate))) {
    suffix += 1;
    candidate = `${root}-${suffix}`.slice(0, 64);
    if (suffix > 100) {
      throw new PlatformError(
        ValidationErrors.FAILED,
        `Could not find a unique slug for base '${base}'`
      );
    }
  }
  return candidate;
}
