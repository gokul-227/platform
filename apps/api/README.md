# `@aec-craft/api`

The deployable. A NestJS host that binds every API package into one Cloud Run
service, and owns nothing of the domain itself.

What lives here is the wiring the packages deliberately do not do: reading the
environment, deciding which optional capabilities an environment has, installing
the access pipeline globally, and assembling the docs portal.

```
src/
  app.module.ts       binds the packages; where every capability switch is decided
  main.ts             CORS, helmet, compression, pino, body limits, bootstrap
  openapi.ts          one OpenAPI document per package + the Scalar portal
  env.ts              requireEnv, and the JWKS location derived from the issuer
  health/             /health, /ready, /version
  mcp/                the JSON-RPC transport over packages/mcp-tools
  run-*.source.ts     the run executor's graph and document tools, adapted in-process
tests/
  unit/ integration/ e2e/   only the host's own: health, version, /mcp,
                            the validation wiring, the index pipeline
```

## The pipeline it installs

| Provider                | Effect                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| `PrincipalGuard`        | `APP_GUARD`. Verifies the token's signature against the issuer's JWKS and its `aud` against `PUBLIC_URL`. Fail-closed; `@Public()` is the only way out |
| `ZodValidationPipe`     | `APP_PIPE`. Validates against the contract schema the DTO names            |
| `PlatformExceptionFilter` | `APP_FILTER`. Turns a `PlatformError` into the wire envelope, never a stack |

The guard verifies one signature and never calls the identity service, so this
API answers requests while that service is down. There is no fallback and no
second token.

## Configuration

`app.module.ts` is where an environment's shape is decided, and it is worth
reading in full before changing an environment. Two rules run through it:

**Identity configuration refuses to guess.** `OIDC_ISSUER`, `PUBLIC_URL`,
`KETO_READ_URL` and `KETO_WRITE_URL` go through `requireEnv`. Every one of them
has a plausible-looking localhost default in the package that reads it, and that
combination fails in the worst available way: the service boots, its health
check passes, and it answers 401 to every gated route. Requiring them moves the
failure to boot, where a deploy shows it.

**Everything else degrades.** No `GRAPH_DB_URI`, no `FILE_STORAGE_BUCKET`, no
`PINECONE_API_KEY`, no `LLM_ENABLED`: those routes answer 503 and the rest of
the API works. See
[`docs/architecture.md`](../../docs/architecture.md#degradation-is-configured-not-coded).

`apps/api/.env.example` is the full annotated list, including the OCR routes and
what each one costs.

## Routes of its own

```
GET  /health     liveness. Never fails on a downstream problem
GET  /ready      readiness. 503 when the database is unreachable
GET  /version    the build it is running
GET  /docs       Scalar, one source per package document
GET  /           redirects to /docs
POST /mcp        JSON-RPC for agents, over the same controllers
```

`/mcp` is excluded from the OpenAPI document: one JSON-RPC envelope over one
path is not describable as REST, and the manifest is already discoverable
through `tools/list`. Only the request/response half of the Streamable HTTP
transport is implemented; nothing pushes notifications, so a client asking for
the stream finds no GET handler and falls back.

`/docs` and the `/openapi*` specs are served with CSP, COOP and CORP disabled,
because Scalar loads a CDN bundle and drives an OAuth popup. That concession is
scoped to those paths; everything else takes helmet defaults, where the three
headers cost nothing because the response is JSON. `API_DOCS_ENABLED=false`
removes the portal entirely.

The portal's OAuth flows send `audience`, not RFC 8707 `resource`: this issuer
accepts `resource` and silently ignores it, so a token requested that way comes
back with an empty `aud` and is refused.

## Migrations

```sh
pnpm --filter @aec-craft/api db:migrate
```

Runs every slice in dependency order (authorization, audit, graph, files,
threads, the authorization backfill, then tenancy and users) against the one
database. Each slice journals separately, so re-running is a no-op per slice.
Deployed environments run this from the pipeline, never by hand.

A slice refuses to migrate when an applied migration's file no longer hashes to
what was applied — editing one is silent otherwise, and the schema quietly stops
matching the code. `<slice>-migrate reconcile` accepts the current files as the
applied ones, and is only ever right once the schema itself has been checked.

## Tests

```sh
pnpm --filter @aec-craft/api test
```

Only the host's own suites live here; each API package owns the suites for its
own code, over the shared harness in `@aec-craft/platform-testing`.

`tests/unit` needs nothing. `tests/integration` and `tests/e2e` need Postgres
and Keto, and skip cleanly when either is unreachable rather than running
against a stub. They use `platform_test`, and the harness refuses to truncate a
database whose name does not end in `_test`.

```sh
pnpm --filter @aec-craft/api surface:smoke   # the three client surfaces, live
pnpm --filter @aec-craft/api graph:smoke     # the projection, against a graph DB
```

`surface:smoke` is the one that answers "does any of this actually work": it
boots the host and drives the SDK, the MCP tools and the admin SDK against it —
create an org, a project and a member, write a changeset, read the same rows
back through each surface. `surface.coverage.e2e` proves a method exists for
every route and a tool points at a live one, but it proves it against a
recording transport that refuses every call, so nothing in it round-trips. This
does. It needs Postgres and Keto and nothing else, and it wipes `platform_test`.

`validation.wiring.e2e` is worth knowing about: it asserts every whole-object
`@Body` / `@Query` parameter resolves to a zod DTO. A DTO imported with
`import type` is erased from `design:paramtypes`, the pipe declines it, and the
wire value reaches the handler with no refusal and no log. Twenty-seven
parameters were once in that state.
