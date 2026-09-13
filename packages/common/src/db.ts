/**
 * Postgres error helpers. Keep narrow — the goal is to translate pg's numeric
 * SQLSTATE codes into typed predicates that services can branch on without
 * re-discovering the codes at every call site.
 */

/**
 * Postgres SQLSTATE `23505` — unique_violation. Thrown by an INSERT that
 * collides with a unique constraint (PK, UNIQUE, or unique index).
 *
 * Service-layer pattern:
 *
 *   try {
 *     await trx.insertInto("foo").values({ ... }).execute();
 *   } catch (err) {
 *     if (isUniqueViolation(err)) throw new PlatformError(FooErrors.ALREADY_EXISTS);
 *     throw err;
 *   }
 */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const code = (err as { code?: unknown }).code;
  if (code === "23505") {
    return true;
  }
  // Drizzle wraps driver errors (DrizzleQueryError) with the pg error as cause.
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "23505"
  );
}
