/**
 * The per-slice DI tokens and drizzle types a suite needs to read the database
 * the app it booted has been writing.
 *
 * Re-exported here so a package's own tests never import a sibling API package:
 * a files e2e that needs an org would otherwise make files-api and tenancy-api
 * dev-depend on each other, and every such pair is a workspace cycle. This
 * package already depends on all of them, which is its job.
 *
 * `DatabasePoolToken` is the tenancy package's, and any slice's would do:
 * every module builds its pool from the same `DATABASE_URL`, and what a suite
 * wants from it is a connection to the test database for `ensureMigrated` and
 * `truncateAll`.
 */

export type { Database as AuditDatabase } from "@aec-craft/platform-audit-api";
export { DatabaseToken as AuditDatabaseToken } from "@aec-craft/platform-audit-api/nest";
export type { Database as AuthorizationDatabase } from "@aec-craft/platform-authorization";
export { DatabaseToken as AuthorizationDatabaseToken } from "@aec-craft/platform-authorization/nest";
export type { Database as FilesDatabase } from "@aec-craft/platform-files-api";
export { DatabaseToken as FilesDatabaseToken } from "@aec-craft/platform-files-api/nest";
export type { Database as GraphDatabase } from "@aec-craft/platform-graph-api";
export { DatabaseToken as GraphDatabaseToken } from "@aec-craft/platform-graph-api/nest";
export type { Database as TenancyDatabase } from "@aec-craft/platform-tenancy-api";
export {
  DatabasePoolToken,
  DatabaseToken as TenancyDatabaseToken,
} from "@aec-craft/platform-tenancy-api/nest";
export type { Database as ThreadsDatabase } from "@aec-craft/platform-threads-api";
export { DatabaseToken as ThreadsDatabaseToken } from "@aec-craft/platform-threads-api/nest";
export type { Database as UsersDatabase } from "@aec-craft/platform-users-api";
export { DatabaseToken as UsersDatabaseToken } from "@aec-craft/platform-users-api/nest";
