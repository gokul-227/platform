// `@aec-craft/platform-contracts` — wire-level contracts shared between the
// platform API server and its SDK. Framework-neutral. Includes:
//   - error spec catalogs + the `PlatformError` class + wire envelope
//   - response interfaces (one per resource)
//   - request input interfaces (no decorators — server-side DTOs implement these)
//   - the authorization vocabulary: standings, permits, and the group tree
//   - the scope spine every scoped row carries
//
// Add new shapes here first; the server and SDK then bind to them.

export * from "./analysis";
export * from "./audit";
export * from "./common/metadata";
export * from "./common/resources";
export * from "./common/scope";
export * from "./errors";
export * from "./files";
export * from "./graph";
export * from "./query";
export * from "./tenancy/groups";
export * from "./tenancy/members";
export * from "./tenancy/orgs";
export * from "./tenancy/projects";
export * from "./threads";
export * from "./users";
