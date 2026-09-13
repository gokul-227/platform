# @aec-craft/platform-audit-api

The `audit_event` table, the `AuditWriter` a writing domain composes into its
own transaction, and the read feeds over both. Embedded in the `apps/api` host.

The package owns no write *routes* by design: audit rows are written by each
domain service inside its own canonical transaction, which is what keeps the
log unable to drift from reality. `org_id` / `project_id` / `actor_id` are
plain uuids, not foreign keys, so the slice stands alone.

`actor_id` is the platform's own `user.id`, never the identity subject. The
subject belongs to the identity provider and changes for the same person when
the provider does, so a log keyed on it would lose every historical actor the
day the provider is swapped. It is nullable, because a `system` action has no
actor and a machine has a client id rather than a profile — `actor_type` says
which. And it stays free of a foreign key on purpose: this row has to outlive
the account it names, so a cascade would erase who acted and a restraint would
refuse the very deletion the log exists to record.

## Routes

| Method | Path                                         | Notes                                          |
| ------ | -------------------------------------------- | ---------------------------------------------- |
| GET    | `/orgs/:orgId/audit/events`                  | the tenant's feed, newest first; `read` on the org's group |
| GET    | `/orgs/:orgId/audit/events/:eventId`         | one event; `read` on the org's group            |
| GET    | `/projects/:projectId/audit/events`          | the project's feed; `read` on the project's group |
| GET    | `/projects/:projectId/audit/events/:eventId` | one event; `read` on the project's group        |

Both lists default to cursor pagination rather than offset, the one package that
does: an append-only feed the SDK pages with `useInfiniteQuery`.

`audit` is a namespace and `events` the collection inside it: a row is one thing
that happened, not one audit.

## Layout

| Path                     | What lives there                                             |
| ------------------------ | ------------------------------------------------------------ |
| `src/config/`            | `AuditApiModule.forRoot()` + the zod-validated `Config`      |
| `src/database/`          | drizzle schema (`audit_event`) + the read-mostly module        |
| `src/modules/`     | the `audit` namespace module                                 |
| `src/modules/events/` | controller, service, DTOs, error catalogue                |
| `src/nest/`              | NestJS bindings + the OpenAPI document spec                  |
| `drizzle/`               | migrations, journaled in `__drizzle_migrations_audit`        |
| `bin/audit-api-migrate`  | the migrate CLI                                              |

## Consuming

```ts
@Module({
  imports: [
    AuthorizationModule.forRoot({ databaseUrl, ketoReadUrl, ketoWriteUrl }),
    AuditApiModule.forRoot({ databaseUrl: DATABASE_URL }),
  ],
})
```

The host provides the access pipeline globally. These routes name their group
in the path, so `@RequirePermit("read")` and `PermitGuard` decide them before
the handler runs.
