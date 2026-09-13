/**
 * Tiny query-string serializer. Keeps the SDK isomorphic (no Node `url`
 * import) and matches how Nest's express adapter parses query strings on the
 * server: arrays serialize as repeated keys (`?select=a&select=b`).
 *
 *   qs()                          // ""
 *   qs({ limit: 50 })             // "?limit=50"
 *   qs({ select: ["a", "b"] })    // "?select=a&select=b"
 *   qs({ foo: undefined })        // ""  (undefined skipped)
 *
 * Only primitive query values are supported (string, number, boolean) plus
 * arrays of strings. Anything else won't round-trip cleanly through a URL,
 * so callers should serialize complex inputs themselves (or use the JSON
 * body for state that doesn't belong in a query string).
 */
type QsPrimitive = string | number | boolean;
type QsValue = QsPrimitive | readonly string[] | null | undefined;

export function qs(input?: Record<string, QsValue>): string {
  if (!input) {
    return "";
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) {
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        params.append(k, item);
      }
    } else {
      params.append(k, String(v));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
