# Local development

Node 22 (`.nvmrc`), pnpm 10, Docker. Nothing else is required, and nothing here
talks to Google Cloud.

## The order that works

The API refuses to boot without an issuer and an authorization store, and both
live in the sibling repository. So that comes up first.

### 1. buildOS ID

```sh
git clone https://github.com/aec-craft/platform-id ../platform-id
cd ../platform-id
pnpm install
cp ory/kratos/kratos.local.example.yml ory/kratos/kratos.local.yml
pnpm ory:up
pnpm dev            # apps/id on :3200, the staff console on :3201
```

That brings up Kratos (4433 public, 4434 admin), Hydra (4444, 4445), Keto
(4466, 4467), its own Postgres on 5434, and a mail catcher that shows you the
sign-in codes it would have emailed. See that repo's
`docs/local-development.md` for the details.

### 2. This repository

```sh
pnpm install
pnpm build:packages
```

`build:packages` is not optional on a fresh clone. The migrate CLIs are built
binaries and `dist/` is gitignored, so `db:migrate` fails with `ENOENT` until it
has run once.

```sh
docker volume create auth_platform-postgres-data   # first time only
docker compose up -d
```

The volume is declared `external`, so compose will not create it. It is named
for the app that first made it rather than for anything meaningful, and
renaming it means a dump and restore.

Postgres binds **5433**, not 5432: a `cloud-sql-proxy` holds the default port on
a machine that talks to a deployed database, and platform-id's Postgres is on
5434.

```sh
cp apps/api/.env.example apps/api/.env
pnpm --filter @aec-craft/api db:migrate
pnpm --filter @aec-craft/api dev        # :3100
```

`db:migrate` runs every slice in dependency order (tenancy and users first,
then authorization, then audit, graph, files and threads) against the one
database. Each keeps its own journal table, so re-running is a no-op per slice.

Check it came up:

```sh
curl -s localhost:3100/health
open http://localhost:3100/docs          # Scalar, one document per package
```

## Calling the API as somebody

Every route except `/health`, `/ready` and `/version` is fail-closed, so you
need a token from Hydra with `aud` equal to this API's `PUBLIC_URL`.

The easiest path is the docs portal. Register an account at
`http://localhost:3200`, then use the **Authorize** button in `/docs`: it runs
the authorization-code flow against Hydra with `DOCS_OIDC_CLIENT_ID` and sends
`audience=http://localhost:3100`, which is what the issuer stamps into `aud` and
the guard verifies. Every request from the portal then carries it.

Not RFC 8707 `resource`, which this issuer accepts and silently ignores: a token
requested that way comes back with an empty `aud` and is refused. The audience
must also be registered on the client, or it is dropped the same way.

A profile is created by the Kratos hook that fires after registration, which
means `IDENTITY_WEBHOOK_SECRET` has to match on both sides for it to land.
Without it, the token verifies and every route answers
`PRINCIPAL_NOT_PROVISIONED`, because no `user` row exists. Set the same value in
`apps/api/.env` and in platform-id's env if you want to exercise that path
locally; leave it unset and provision by other means if you do not.

## Optional capabilities

Everything below is off by default. The routes still exist and answer `503`
rather than the app failing to boot, which is deliberate and described in
[`architecture.md`](architecture.md#degradation-is-configured-not-coded).

**Graph traversal.** Postgres is the system of record either way; Memgraph
serves the queries recursive CTEs handle badly.

```sh
pnpm --filter @aec-craft/platform-graph-api db:graph:up   # bolt on 7687, Lab on 3030
# then set GRAPH_DB_URI=bolt://localhost:7687 in apps/api/.env
```

The image is `memgraph-mage`, not plain `memgraph`: the analytical queries call
MAGE modules such as `weakly_connected_components`.

**File bytes.** Set `FILE_STORAGE_BUCKET` and either point at a real GCS bucket
(signing with `gcloud auth application-default login`) or run MinIO and set
`FILE_STORAGE_PROVIDER=s3` with its endpoint. Unset, folder operations work and
byte operations answer `FILE_STORAGE_UNAVAILABLE`.

**Document index and generated replies.** `PINECONE_API_KEY` turns uploads
under the `document` preset into searchable text; `LLM_ENABLED=true` wakes the
run worker so chat threads generate. Both bill through Vertex on application
default credentials. `apps/api/.env.example` documents every knob, including
the OCR routes and what each one costs.

## Tests

```sh
pnpm test                                        # every package, one at a time
pnpm --filter @aec-craft/platform-files-api test # one package's suites
```

```sh
pnpm test:coverage                               # the same, with the floors enforced
```

Each package owns the suites for its own code, in `tests/unit`,
`tests/integration` and `tests/e2e`. They run against `src` rather than `dist` —
the shared vitest config aliases every workspace specifier at its source — so an
edit needs no rebuild before a re-run, and coverage means something. Each
package has a floor it has to hold, measured rather than aspired to, in one map
in `@aec-craft/platform-testing`. `apps/api` keeps only what is genuinely the
host: health, the version controller, the MCP surface, the validation wiring,
and the document-index pipeline, which drives the host's own adapter and cannot
move without it. What they share (slice migration and truncation, the Nest host
that mounts every API package, the service factories, the fetch client that
speaks the test principal header) is `@aec-craft/platform-testing`, a
source-only package that is never built and never published.

The suites that need a database use `platform_test`, a separate database from
your dev `platform`, because the harness truncates every table between tests.
It refuses outright to wipe a database whose name does not end in `_test`.
Create it once:

```sh
docker exec platform-postgres createdb -U auth_app_role platform_test
```

The harness migrates it itself. Suites that cannot reach Postgres or Keto skip
cleanly rather than running against a stub, so a green run with the stack down
means less than it looks: check that the integration suites actually ran.

They also share that one database, so two runs at once make `truncateAll` time
out and fail tests that pass alone. `pnpm test` serializes packages for exactly
that reason; a second run in another worktree does not know about the first.

## Is it actually working

```sh
pnpm --filter @aec-craft/api surface:smoke
```

Boots the host and drives all three client surfaces against it — the SDK, the
MCP tools, the admin SDK — creating an org, a project, a member, a folder and a
changeset, then reading the same rows back through each. Twenty-three checks,
one line each. Needs Postgres and Keto; wipes `platform_test`.

## Before committing

```sh
pnpm fix         # format + autofix, Biome via ultracite
pnpm validate    # typecheck + lint
```

Lefthook installs a pre-commit hook on `pnpm install`.

## Against a deployed database

Occasionally useful for reading dev data, never for writing it. Run the proxy
(`cloud-sql-proxy <dev-connection-name>`, which takes 5432) and point
`DATABASE_URL` at the dev `db-url` secret. **Do not run migrations against a
deployed environment**; those belong to the deploy pipeline, which serializes
them per environment and bounds their lock and statement timeouts.
