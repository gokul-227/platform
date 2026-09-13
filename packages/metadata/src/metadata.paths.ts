import { PlatformError, ValidationErrors } from "@aec-craft/platform-contracts";

/**
 * Pure helpers backing the metadata KV sub-resource. A dotted `keyPath`
 * (`apps.platform.theme`) addresses a node inside an entity's `metadata` JSONB
 * bag. Writes replace the value at that node and create missing parents;
 * sibling keys are preserved. The DB-facing read-modify-write (under a row
 * lock) lives in `MetadataService` — these functions only do the path math so
 * they can be unit-tested without a database.
 */

export type MetadataBag = Record<string, unknown>;

/**
 * Split a dotted key path into segments, rejecting empty/blank segments
 * (leading, trailing, or doubled dots). Keys cannot contain a literal `.`.
 */
export function parseMetadataKeyPath(keyPath: string): string[] {
  const segments = keyPath.split(".");
  if (segments.some((s) => s.length === 0)) {
    throw new PlatformError(
      ValidationErrors.FAILED,
      `Invalid metadata key path '${keyPath}': segments must be non-empty (no leading, trailing, or doubled dots)`
    );
  }
  return segments;
}

function isPlainObject(value: unknown): value is MetadataBag {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Return a new bag with `value` set at `path`. Intermediate objects are created
 * as needed; a non-object value encountered along the path is replaced with a
 * fresh object so the deeper key has somewhere to live. Immutable: the input
 * bag is never mutated.
 */
export function setAtPath(
  bag: MetadataBag,
  path: string[],
  value: unknown
): MetadataBag {
  const [head, ...rest] = path;
  if (head === undefined) {
    // Empty path is unreachable (parseMetadataKeyPath guarantees ≥1 segment),
    // but guard so the type narrows.
    throw new PlatformError(ValidationErrors.FAILED, "Empty metadata key path");
  }
  const next = { ...bag };
  if (rest.length === 0) {
    next[head] = value;
    return next;
  }
  const child = isPlainObject(next[head]) ? next[head] : {};
  next[head] = setAtPath(child, rest, value);
  return next;
}

/**
 * Return a new bag with the key at `path` removed. If any segment along the
 * path is missing or not an object, the bag is returned unchanged (delete of a
 * non-existent key is a no-op). Immutable.
 */
export function deleteAtPath(bag: MetadataBag, path: string[]): MetadataBag {
  const [head, ...rest] = path;
  if (head === undefined || !(head in bag)) {
    return bag;
  }
  const next = { ...bag };
  if (rest.length === 0) {
    delete next[head];
    return next;
  }
  const child = next[head];
  if (!isPlainObject(child)) {
    return bag;
  }
  next[head] = deleteAtPath(child, rest);
  return next;
}
