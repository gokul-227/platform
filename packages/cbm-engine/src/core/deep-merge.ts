const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Merge a patch into a target, in place, descending into nested objects.
 *
 * Subtrees are adopted by reference rather than cloned, so a caller must hand
 * over a fresh patch object each time. Sharing one between two nodes would give
 * them the same object and make a later write to one visible on the other.
 */
export function deepMerge(
  into: Record<string, unknown>,
  patch: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(patch)) {
    const existing = into[key];
    if (isRecord(existing) && isRecord(value)) {
      deepMerge(existing, value);
    } else {
      into[key] = value;
    }
  }
}
