# @aec-craft/platform-authorization

The authorization kernel, embedded in the `apps/api` host: the group tree, and
the only decision surface in the estate. It answers one question, may this
caller do this here, and owns the two stores that answer it.

It serves **no routes** and publishes **no OpenAPI document**, which is why it
carries no `-api` suffix. The surface a person uses (`/orgs/:orgId/members`,
`/projects/:projectId/members`) belongs to `@aec-craft/platform-tenancy-api`,
which writes this package's table and tuples through the `KetoClient` and
`group` schema exported here. Splitting it that way keeps every resource package
depending on a library rather than on the package that serves `/orgs`.

buildOS ID owns the store (Ory Keto) and the namespace model
(`@aec-craft/platform-id-permissions`). The escalation guard and the audit row
live with the member surface, because they belong in the same operation as the
grant.

The model itself is [`docs/authorization.md`](../../docs/authorization.md).
Read that first; this is how it is bound.

## What another package uses

```ts
// The scope is known from the path: the guard resolves and checks it before the
// handler runs, and hands it over to be stamped on the new row.
@RequirePermit("write")
@Post("orgs/:orgId/files")
create(@CurrentScope() scope: ResolvedScope, @Body() dto: CreateFileDto) {}

// A by-id route cannot: the group comes off the row, so the check happens once
// the row is held. A decorator here would claim to run before the work it needs.
await this.checks.assertCanRow(principal, "write", row);
```

`PermitGuard` passes a route with no `@RequirePermit` straight through.
Authentication is already global and fail-closed; making this guard refuse
undeclared routes would break every public and by-id route for the wrong reason.

`AuthorizationService` is the whole read surface: `assertCan`, `assertCanOrMask`
(a caller who cannot even read the group is told the row is not there),
`assertCanAll` for a changeset touching several groups, `assertCanRow`, and the
readable-group resolution a list filters on. It fails closed on an empty scope,
so a cross-tenant list fans out over `readableOrgs` instead of asking it for
everything. The per-request cache memoizes, so a list fanning out over many
groups asks Keto for each one once.

## Layout

| Path                            | What lives there                                       |
| ------------------------------- | ------------------------------------------------------ |
| `src/scope.ts`                  | where "here" is: `ScopeRef`, `resolveScopeRef`, `scopeFor`, `scopeIn`, `resolveGroup` |
| `src/permit.ts`                 | may they: `can`, the four `assertCan*`, `permitsOn` |
| `src/readable.ts`               | what may they see: `readableGroups`, `readableProjects`, `readableOrgs` |
| `src/guards/`                   | `ScopePermitGuard` + `@RequirePermit`, `RowPermitGuard` + `@RequireRowPermit`, `StaffGuard` + `@RequireStaff` |
| `src/authorization.service.ts`  | the facade over those three, and `AuthorizationModule.forRoot()` in `authorization.module.ts` |
| `src/config/`                   | `Config` and the not-found masks the host names        |
| `src/database/`                 | the `group` table                                      |
| `src/keto/`                     | the tuple vocabulary and the read/write clients        |
| `src/nest/`                     | the NestJS bindings                                    |
| `drizzle/`                      | migrations, journaled separately from every other slice |
| `bin/authorization-migrate`     | the migrate CLI                                        |
| `bin/authorization-backfill`    | seeds groups and tuples for rows that predate the model |

Nothing here is named for the group but the things that refer to the table:
`ScopeRef` is what a request names, `ResolvedScope` is what it resolves to, and
the service is named for the question rather than for the grain that answers it.

One Postgres table, because Keto already holds membership and the grants between
groups and can list them from either end. What it cannot answer is what a group
*is*: it knows `Group:<uuid>` as an opaque string, and a group with no tuples
does not exist there at all. The table is owned here rather than with the
surface that writes it because the check path reads it on every request:
resolving a partition to its group, and a caller's readable set to a candidate
list, are both queries against these columns.

The migrations journal into `__drizzle_migrations_permissions`, which is the name
they were created under. The genesis is a bare `CREATE TABLE "group"`, so a
renamed journal would replay it and fail on every database that already has the
table.

## Consuming

```ts
@Module({
  imports: [
    AuthorizationModule.forRoot({
      databaseUrl: DATABASE_URL,
      ketoReadUrl: KETO_READ_URL,
      ketoWriteUrl: KETO_WRITE_URL,
      // On in a deployed environment, where Keto is IAM-gated. Off locally,
      // where it has no authentication and is bound to loopback.
      ketoIdentityTokens: true,
      // What a caller who may not see a partition is told it is missing as.
      masks: { org: OrgErrors.NOT_FOUND, project: ProjectErrors.NOT_FOUND },
    }),
  ],
})
```

The module is global: every other API package uses its guard and check service
without importing it again. The two Keto URLs are read with `requireEnv` in the
host, so a missing one refuses to boot rather than answering 401 on every gated
route while the health check stays green.
