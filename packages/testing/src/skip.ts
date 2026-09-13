/**
 * Sync check for `describe.skipIf(...)`. The decision is made once in
 * `tests/global-setup.ts` and stashed on `process.env.PLATFORM_API_DB_OK`.
 *
 *   describe.skipIf(!dbAvailable())("OrgService", () => { ... });
 *
 * Returning `false` from this skips the suite with a clean message instead
 * of crashing on the first DB call.
 */
export function dbAvailable(): boolean {
  return process.env.PLATFORM_API_DB_OK === "1";
}

/**
 * As `dbAvailable`, for the permission store. A suite that exercises
 * authorization needs both.
 */
export function ketoAvailable(): boolean {
  return process.env.PLATFORM_API_KETO_OK === "1";
}
