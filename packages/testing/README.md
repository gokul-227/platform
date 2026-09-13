# @aec-craft/platform-testing

What every package's suite shares: the Nest host it boots, the real Postgres and
Keto it boots against, the fixtures it writes, and the vitest configuration all
of that needs. Repo-internal and never published.

Not a mock library. The point of these suites is that authorization behaves, and
a stubbed permission store answers whatever the stub was told to — it would
assert the fixture rather than the model. Keto is real, Postgres is real, and
the only thing faked is the bucket.

## Entries

| Entry       | What it gives you                                                |
| ----------- | ---------------------------------------------------------------- |
| `.`         | `bootstrapTestApp`, `useTestDb`, `buildServices`, the fixtures, `req` |
| `./vitest`  | `defineTestConfig`, which every package's `vitest.config.ts` calls |

## Layout

| Path                  | What lives there                                          |
| --------------------- | --------------------------------------------------------- |
| `src/app.ts`          | the host every e2e suite boots: every API package, the masks, the test principal |
| `src/db.ts`           | the pool, the per-slice migrations, `truncateAll`          |
| `src/use-test-db.ts`  | the same, as a `beforeAll` / `beforeEach` hook              |
| `src/factories.ts`    | the service bundle and the fixtures (`makeOrg`, `createNode`, `grantStanding`) |
| `src/request.ts`      | `req(baseUrl).user({...}).get(...)`, the signed-in caller  |
| `src/vitest.config.ts`| the shared config: source aliasing, decorators, coverage floors |

## The two settings that are not taste

**Every workspace specifier resolves to `src`.** `defineTestConfig` reads each
package's own `exports` map and aliases it at its source. Without that a suite
runs against `dist`, which is a different program: a package edited but not
rebuilt is tested in its last-built state, and v8 coverage of `src` reads zero
because no line of it was ever loaded.

**`fileParallelism: false`.** Integration suites share one Postgres and truncate
between tests, so parallel files race on the same rows. The root `pnpm test`
serializes across packages for the same reason (`--workspace-concurrency=1`).

## Coverage

`pnpm test:coverage` runs every package's suite with v8 coverage against the
floor in `COVERAGE_FLOORS`. The floors are measured rather than aspired to, and
they are a ratchet: raise one when a suite earns it, never lower one to make a
run pass.

## The database a test may wipe

`truncateAll` empties every row in `beforeEach`, so it refuses any database whose
name does not end in `_test`. That guard exists because one `dotenv -e .env`
wrapper once pointed the suites at the dev database and deleted a developer's
org, projects and files.

```sh
DATABASE_URL=postgres://auth_app_role:dev@localhost:5433/platform_test
```

Port 5433, not 5432: `cloud-sql-proxy` occupies 5432 locally.
