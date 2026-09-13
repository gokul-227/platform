# @aec-craft/platform-tenancy-api

The tenancy spine, embedded in the `apps/api` host: organizations, the projects
inside them, and who is in each. Mutations compose the transactional
`AuditWriter` from `@aec-craft/platform-audit-api`; the read feeds live there
too.

Named for its domain rather than a segment, which is the one place this repo
allows that: `/orgs`, `/projects` and the members inside them are one partition
tree, and a project cannot be created without an org to hold it.

Operates on its slice of the **platform database** rather than a logical DB of
its own. It owns `org` and `project` and their migrations, and it is the writer
of the `group` table, which `@aec-craft/platform-authorization` owns because the
check path reads it on every request.

There is no invite or role surface. What someone may do is one of five
standings, and the two member collections below are where it is granted. A group
is how the authorization kernel stores that and is not a noun a caller sees; a
team spanning projects arrives later as **Teams**.

## Routes

| Method | Path                                       | Notes                                          |
| ------ | ------------------------------------------ | ---------------------------------------------- |
| GET    | `/orgs`                                    | the organizations the caller may read           |
| POST   | `/orgs`                                    | the creator becomes its owner                   |
| GET    | `/orgs/:orgId`                             | absent rather than refused when nothing is held |
| PATCH  | `/orgs/:orgId`                             | name / slug                                     |
| DELETE | `/orgs/:orgId`                             | takes every group and project beneath it        |
| PUT    | `/orgs/:orgId/metadata/:keyPath`           | merge-write one key into the bag                |
| DELETE | `/orgs/:orgId/metadata/:keyPath`           | remove one key                                  |
| GET    | `/projects`                                | the flat list, across tenants                   |
| GET    | `/orgs/:orgId/projects`                    | the same, narrowed to one tenant                |
| POST   | `/orgs/:orgId/projects`                    | the partition is in the path, so the body carries no `orgId` |
| GET    | `/projects/:projectId`                     | flat; scope resolved from the row               |
| PATCH  | `/projects/:projectId`                     | name / slug                                     |
| DELETE | `/projects/:projectId`                     | takes the project's group with it               |
| PUT    | `/projects/:projectId/metadata/:keyPath`   | merge-write one key into the bag                |
| DELETE | `/projects/:projectId/metadata/:keyPath`   | remove one key                                  |
| GET    | `/orgs/:orgId/members`                     | everyone in the tenant, with the standing each holds |
| POST   | `/orgs/:orgId/members`                     | add by email, or by subject for a service account |
| PATCH  | `/orgs/:orgId/members/:subjectId`          | change a standing                               |
| DELETE | `/orgs/:orgId/members/:subjectId`          | remove somebody; the last owner cannot go       |
| GET    | `/projects/:projectId/members`             | the same, plus whoever the org carries into it  |
| POST   | `/projects/:projectId/members`             | add to this project alone                       |
| PATCH  | `/projects/:projectId/members/:subjectId`  | direct standings only; an inherited one is changed on the org |
| DELETE | `/projects/:projectId/members/:subjectId`  | direct standings only                           |

A membership is a membership *of* a partition, so it nests; a by-id read stays
flat. The nesting is what lets `@RequirePermit` resolve the partition from the
path before the body is parsed, which is also why a create body carries no
`orgId`.

Reading the member list needs `read`: who else is in a tenant is not a secret
from the people in it. Every write needs `manage`, plus a standing strictly below
the caller's own. A partition the caller holds nothing on is absent rather than
refused.

Every list endpoint serves the shared paged envelope (offset by default, cursor
available) and the PostgREST-style filter grammar. The member lists are the
exception: offset only and unfiltered, because they are resolved by walking the
tuple store rather than read from a table.

## Layout

| Path                              | What lives there                                     |
| --------------------------------- | ---------------------------------------------------- |
| `src/config/`                     | `TenancyApiModule.forRoot()` + `Config`              |
| `src/database/schema.ts`          | drizzle schema for `org` and `project`               |
| `src/modules/orgs/`               | orgs + `metadata/`                                   |
| `src/modules/projects/`           | projects + `metadata/`                               |
| `src/modules/orgs/members/`       | `/orgs/:orgId/members`                               |
| `src/modules/projects/members/`   | `/projects/:projectId/members`                       |
| `src/modules/members/`            | the standing arithmetic both serve: escalation ceiling, last owner, the audit row |
| `src/modules/groups/`             | the group rows and their tuples; internal, no routes |
| `src/nest/`                       | NestJS bindings + the OpenAPI document spec          |
| `drizzle/`                        | migrations, journaled separately from every other slice |
| `bin/tenancy-api-migrate`         | the migrate CLI                                      |

The member list joins the `user` table from `@aec-craft/platform-users-api`, which owns it: a member is a subject, and a name for one comes from the package that holds the profile.

The migrate CLI drops the retired membership tables, which
`authorization-backfill` reads to write the tuples that replace them. `apps/api`'s
`db:migrate` sequences the backfill first; do not run this on its own against a
database that still has memberships to convert.

## Consuming

```ts
@Module({
  imports: [
    AuthorizationModule.forRoot({ databaseUrl, ketoReadUrl, ketoWriteUrl }),
    TenancyApiModule.forRoot({ databaseUrl: DATABASE_URL }),
  ],
})
```

`AuthorizationModule` is global and must be bound: these controllers declare
`@RequirePermit`, and the services write standings through its `KetoClient`.
