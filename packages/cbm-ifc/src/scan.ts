/**
 * Reading relationships out of the STEP text.
 *
 * Some facts are easier to take from the characters than from the kernel, and
 * two are easier only from the characters: the unit assignment, and whether a
 * space boundary is virtual. Each mechanism owns the scan for its own
 * relationship; this holds the one thing they all need.
 */

/** A STEP line reference, e.g. `#4711`. */
export type LineRef = string;

const ENTITY_WITH_GUID = /#(\d+)\s*=\s*IFC[A-Z0-9]+\s*\(\s*'([^']+)'/g;

/**
 * Line reference to GlobalId, for every entity that has one.
 *
 * Relationships name their ends by line reference, and everything downstream
 * addresses things by GlobalId, so every scan needs this translation. Built
 * once in a single pass and shared, because building it per relationship would
 * make the read quadratic in the size of the file.
 */
export function guidIndex(text: string): Map<LineRef, string> {
  const index = new Map<LineRef, string>();
  for (const [, line, guid] of text.matchAll(ENTITY_WITH_GUID)) {
    if (line && guid) {
      index.set(`#${line}`, guid);
    }
  }
  return index;
}

/** Resolve a reference to a GlobalId. `$` is IFC's null and resolves to none. */
export function resolveGuid(
  index: Map<LineRef, string>,
  ref: string | undefined
): string | null {
  return ref && ref !== "$" ? (index.get(ref) ?? null) : null;
}
