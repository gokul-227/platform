# @aec-craft/platform-common

The common layer of the API packages: everything every `platform-*-api` needs
to be built, with no domain knowledge of its own. Deliberately not an API.
Packages depend on this (plus `platform-contracts` and `platform-authorization`)
instead of on each other.

Nothing here may reference a domain (orgs, files, threads, graph); domain code
lives in the API packages.

## Entries

| Entry       | What it gives you                                                    |
| ----------- | -------------------------------------------------------------------- |
| `.`         | scope helpers, slugs, the unique-violation check, the Cypher scope predicate |
| `./drizzle` | the scope predicates, the database-module factory, the migrate CLI, the timestamp column |
| `./nest`    | swagger decorators, the exception filter, the OpenAPI doc-spec contract |

No table is defined here. Each one lives with the package that owns its
migrations and serves it (`user` in users-api, `audit_event` in audit-api,
`group` in platform-authorization), and a slice that joins somebody else's
imports that package.

## Layout

| Path                | What lives there                                              |
| ------------------- | -------------------------------------------------------------- |
| `src/scope.ts`      | the scope vocabulary a service reads off a row                 |
| `src/slug.ts`       | `makeSlug`                                                      |
| `src/db.ts`         | `isUniqueViolation` and friends                                |
| `src/query/`        | the Cypher scope predicate, for the packages that read the projection |
| `src/drizzle/`      | `scopeWhere*` / `groupWhereReadable`, `createDrizzleDatabaseModule`, `runMigrateCli`, `msTimestamp` |
| `src/nest/`         | `ApiFilterQueries`, `ApiPaginationQueries`, `ApiScopeQueries`, `ApiPathParams`, `ApiPlatformErrors`, `PlatformExceptionFilter`, `ApiDocumentSpec` |

## List endpoints

A list endpoint declares one `defineListSpec` in `platform-contracts`, then
reads it from three places that cannot drift apart: `listInputSchema` /
`listResponseSchema` build the wire shapes, `@ApiFilterQueries` +
`@ApiPaginationQueries` document them, and `@aec-craft/platform-query`'s
`resolvePageQuery` + `filterConditions` + `sortExpressions` apply them. See
[`docs/list-filter-framework.md`](../../docs/list-filter-framework.md).
