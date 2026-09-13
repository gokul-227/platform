// `@aec-craft/platform-common/drizzle` — the drizzle-bound half of the common
// layer: the scope predicates, the database-module factory, the migrate CLI and
// the timestamp column. The root entry keeps the framework-neutral helpers
// (parsing, scope, slugs).
//
// No table is defined here. Each one lives with the package that owns its
// migrations and serves it, and a slice that joins somebody else's imports that
// package.

export {
  createDrizzleDatabaseModule,
  type DrizzleDatabaseModuleOptions,
} from "./database.module";
// `filterConditions` / `sortExpressions` moved to
// `@aec-craft/platform-common/drizzle` with the rest of the dialect.
export { runMigrateCli } from "./migrate.cli";
export * from "./query";
export { firstRowOrThrow } from "./rows";
export {
  groupWhereReadable,
  type ScopeColumns,
  scopeWhereStrict,
  scopeWhereVisible,
} from "./scope";
export { msTimestamp } from "./timestamp";
