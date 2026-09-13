# @aec-craft/platform-users-api

The people behind the subjects, embedded in the `apps/api` host: the signed-in
user's own profile, and the back-channel that provisions a profile from the
identity provider.

Named for the `user` row it owns. The staff view of the same table is
`/admin/users`, served by `@aec-craft/platform-admin-api` through this package's
`UserService`.

Operates on its slice of the **platform database** rather than a logical DB of
its own. It owns `user` and its migrations. Two other packages read a name from
that table and pin the columns they touch rather than importing this one, because
this package depends on `@aec-craft/platform-tenancy-api` to read the group tree
and importing it back would close a cycle.

## Routes

| Method | Path                                | Notes                                            |
| ------ | ----------------------------------- | ------------------------------------------------ |
| GET    | `/me`                               | the caller's own profile, resolved from the token |
| PATCH  | `/me`                               | name / picture                                    |
| PUT    | `/me/metadata/:keyPath`             | merge-write one key into the bag                  |
| DELETE | `/me/metadata/:keyPath`             | remove one key                                    |
| GET    | `/me/groups`                        | what the caller holds, resolved as permits rather than membership rows |
| POST   | `/webhooks/identity`                | the provider's back-channel; creates or refreshes a profile, guarded by a shared secret |
| DELETE | `/webhooks/identity/:externalId`    | a deletion propagated from the provider           |

`/me/groups` lives here rather than with the group surface it reads because the
subject of the question is the caller, and every other `/me` route is here. It
answers with permits rather than membership rows: a standing reaches a partition
down the parent chain, so a surface keyed on "is there a row for me here" would
hide controls its user is entitled to.

Every list endpoint serves the shared paged envelope (offset by default, cursor
available) and the PostgREST-style filter grammar.

## Layout

| Path                             | What lives there                                    |
| -------------------------------- | --------------------------------------------------- |
| `src/common/`                    | the principal-to-user resolver                      |
| `src/config/`                    | `UsersApiModule.forRoot()` + `Config`               |
| `src/database/`                  | drizzle schema for the `user` slice                 |
| `src/modules/me/`          | self, its metadata KV, and its standings            |
| `src/modules/webhooks/identity/` | profile provisioning and the cascade delete         |
| `src/nest/`                      | NestJS bindings + the OpenAPI document spec         |
| `drizzle/`                       | migrations, journaled separately from every other slice |
| `bin/users-api-migrate`          | the migrate CLI                                     |

## Consuming

```ts
@Module({
  imports: [
    AuthorizationModule.forRoot({ databaseUrl, ketoReadUrl, ketoWriteUrl }),
    TenancyApiModule.forRoot({ databaseUrl }),
    UsersApiModule.forRoot({
      databaseUrl: DATABASE_URL,
      identityWebhookSecret: IDENTITY_WEBHOOK_SECRET,
    }),
  ],
})
```

`TenancyApiModule` must be bound: deleting a profile revokes every standing it
holds, and `/me/groups` reads the partition tree.

`identityWebhookSecret` is optional and the guard is fail-closed: unset, every hook
is rejected with 401, no user row is ever written, and every authenticated caller
then fails `PRINCIPAL_NOT_PROVISIONED`. Optional locally, where the hook goes
unexercised; required in a deployed environment.
