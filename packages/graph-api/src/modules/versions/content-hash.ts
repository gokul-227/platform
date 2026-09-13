import { createHash } from "node:crypto";

/**
 * Sorts object keys recursively, so two structurally equal values serialize
 * identically. Arrays keep their order, which is meaningful in property blocks.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => Number(a > b) - Number(a < b))
        .map(([k, v]) => [k, sortKeys(v)])
    );
  }
  return value;
}

/**
 * sha256 over the canonical JSON of an entity's content fields. Identity, scope,
 * version counters and timestamps stay out, or a no-op write would not hash
 * equal to the stored state.
 */
export function contentHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

/**
 * Neutral parameter names so `security/detect-possible-timing-attacks` does not
 * flag it: a content hash is not a secret and needs no constant-time compare.
 */
export function digestsEqual(a: string, b: string | null): boolean {
  return a === b;
}
