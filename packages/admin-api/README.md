# @aec-craft/platform-admin-api

The staff surface: every tenant, every project and every person in the
estate, read-mostly. `StaffGuard` runs class-wide on every controller and no
route declares a permit, because a staff member's reach is not a standing on a
group.

Reachable on a browser session only. Consent puts no staff role into an OAuth
grant, so no delegated token carries what this gates on, and these routes are
unreachable to every client credential and every MCP token by construction
rather than by policy.

**Owns no tables.** Every route delegates to the package that owns the row, so
a staff write takes the same transaction and leaves the same audit row a
tenant's own admin would, naming the staff member as the actor. The only query that
is not a delegation is a list without its visibility predicate.

**Not in the portal.** Its OpenAPI document is built and scanned, because that
is what the conventions and validation gates read, but it is not served and not
a Scalar source.

## Routes

| Method | Path                          | Notes                                     |
| ------ | ----------------------------- | ----------------------------------------- |
| GET    | `/admin/orgs`                 | every organization in the estate          |
| GET    | `/admin/orgs/:orgId`          | 404 means absent; nothing is masked here  |
| PATCH  | `/admin/orgs/:orgId`          | name / slug, audited as the staff member      |
| GET    | `/admin/projects`             | every project, across every organization  |
| GET    | `/admin/orgs/:orgId/projects` | the same, narrowed to one tenant          |
| GET    | `/admin/projects/:projectId`  | 404 means absent                          |
| PATCH  | `/admin/projects/:projectId`  | name / slug, audited as the staff member      |
| GET    | `/admin/users`                | every person in the system, read-only     |
| GET    | `/admin/users/:userId`        | one person by id                          |
| DELETE | `/admin/users/:userId`        | the profile and its standings; 409 for a last owner |

## What is deliberately absent

- **Creating a tenant.** It would make the staff member its first owner.
- **Deleting a tenant or a project.** Irreversible, and it takes every group
  beneath it. That needs its own operation with a reason attached.
- **Any role write.** What somebody may do is a standing on a group, changed
  through the group routes, where the change leaves an audit row naming the
  staff member.
- **The data plane.** No files, no graph, no threads, no rules, no objects and
  no analysis: a staff member cannot read a customer's model through this package.

## Layout

| Path                     | What lives there                                |
| ------------------------ | ----------------------------------------------- |
| `src/config/`            | `AdminApiModule`; nothing to configure          |
| `src/modules/orgs/`      | the org controller and its DTOs                 |
| `src/modules/projects/`  | the project controller and its DTOs             |
| `src/modules/`     | the user controller and its DTOs                |
| `src/nest/`              | NestJS bindings + the OpenAPI document spec     |

## Consuming

```ts
@Module({
  imports: [
    AuthorizationModule.forRoot({ databaseUrl, ketoReadUrl, ketoWriteUrl }),
    TenancyApiModule.forRoot({ databaseUrl: DATABASE_URL }),
    UsersApiModule.forRoot({ databaseUrl: DATABASE_URL }),
    AdminApiModule,
  ],
})
```

No `forRoot`: this package owns no tables and no pool. It resolves `OrgService`,
`ProjectService` and `UserService` from the global modules of the packages that
own those rows, so both must be registered.
