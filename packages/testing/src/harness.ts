// Everything a suite needs that does not itself need vitest: the host, the
// database, the fixtures, the request client.
//
// Split from `index.ts` so a plain node script can use it. `use-test-db.ts`
// calls `beforeAll`, and importing vitest from CommonJS throws outright, which
// is what the smoke scripts hit — they run under a CJS require hook because a
// decorated class compiled to CJS has no named export an ESM importer can see.

export { bootstrapTestApp, TestAppModule } from "./app";
export {
  createTestDb,
  createTestPool,
  dbUrl,
  ensureMigrated,
  isDbReachable,
  truncateAll,
} from "./db";
export * from "./factories";
export { type PrincipalHeaders, type ResponseEnvelope, req } from "./request";
export { dbAvailable, ketoAvailable } from "./skip";
export * from "./slices";
export { TestPrincipalGuard } from "./test-principal.guard";
export { TestPrincipalMiddleware } from "./test-principal.middleware";
