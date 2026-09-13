/**
 * Return the first row or throw the caller's error — the drizzle counterpart
 * of `executeTakeFirstOrThrow` for `.returning()` / `.limit(1)` result
 * arrays. The thrown value is caller-supplied so domain error masking
 * (NOT_FOUND et al.) stays at the call site.
 */
export function firstRowOrThrow<T>(rows: T[], error: () => Error): T {
  const row = rows[0];
  if (!row) {
    throw error();
  }
  return row;
}
