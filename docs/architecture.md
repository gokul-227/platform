# Architecture

## The shape of the thing

Organizations are the tenant. Projects live inside them. Files, graph nodes and
edges, chat threads and audit rows live in one or the other. That is the whole
domain model, and everything below is machinery for holding it safely.

Two ideas do most of the work, and neither is obvious from the route table:

**A row's owner is a group, not its partition.** Every row carries `group_id`
(who it answers to) alongside `org_id` / `project_id` (where it lives). The
first is the only input to an authorization check; the second two are for
filtering, listing and tenant isolation, and no check ever reads them. Keeping
them apart is what lets a row be handed to somebody other than the scope's own
people without inventing a new kind of container. See
[`authorization.md`](authorization.md).

**One definition per wire shape.** `packages/contracts` holds the zod schema,
the error catalog entry and the list spec for everything the API speaks. The
server validates against it, the SDK types against it, the React hooks reuse the
SDK's types, and the MCP descriptors point at it. A shape added anywhere else
is drift by construction.

## Where the code runs

```
                    buildOS ID  (aec-craft/platform-id)
                    Hydra issues the token · Keto stores the tuples
                          │  JWKS          │  check / expand
                          ▼                ▼
  clients ──HTTPS──▶  apps/api  (Cloud Run, one container)
                      REST, and JSON-RPC for agents at POST /mcp
                          │
     PrincipalGuard ──▶ verify signature + audience, attach principal
     PermitGuard    ──▶ check the permit against the row's group
     module         ──▶ directory · permissions · files · graph · threads · audit
                          │
                          ├── Postgres (Cloud SQL): every slice, one database
                          ├── Memgraph (GCE): the graph projection, read-only
                          ├── GCS bucket: file bytes, never through the API
                          └── Pinecone + Vertex: document index and generation
```

Identity is deliberately outside. This API never calls buildOS ID to answer a
request: it verifies one signature against Hydra's published keys and proceeds,
so it keeps serving while the identity service is down. The two only meet on a
back-channel, described under [Provisioning](#provisioning) below.

## A request, end to end

1. **`PrincipalGuard`** (`@aec-craft/platform-id-resource-nestjs`, registered as
   a global `APP_GUARD`) verifies the bearer token's signature against the
   issuer's JWKS and requires `aud` to equal this API's own `PUBLIC_URL`. Both
   sides read that one value, so they cannot drift. Fail-closed: a route opts
   out with `@Public()`, and nothing else does.
2. **`ZodValidationPipe`** validates the body or query against the contract
   schema the DTO names. A DTO imported with `import type` is erased from
   `design:paramtypes` and silently skips validation, which is why
   `validation.wiring.e2e` asserts every whole-object parameter resolves to a
   zod DTO.
3. **Authorization**, in one of two shapes. A route that knows its group before
   reading anything declares `@RequirePermit("write")` and `PermitGuard`
   resolves the group from the path and checks it. A by-id route cannot: the
   group comes off the row, so the service calls
   `AuthorizationService.assertCanRow` once it holds it. Checks within a
   request share a memo, so a list that fans out over many groups asks Keto for
   each one once.
4. **The service** does its work in one transaction and composes
   `AuditWriter.record` into it, so the log cannot record something the database
   rolled back.
5. **`PlatformExceptionFilter`** turns a `PlatformError` into the wire envelope
   the SDK switches on: a stable `UPPER_SNAKE` code, never a stack.

A denial and a missing row answer the same way. Telling a caller that a row
exists is itself the disclosure, so unreachable rows are absent from listings
rather than 403.

## Agents reach the same routes

`POST /mcp` is a JSON-RPC transport in front of the same controllers, not a
second API. `packages/mcp-tools` holds one typed descriptor per exposed
route (its schemas imported from `packages/contracts`, so a tool cannot drift
from the route it names), and the endpoint dispatches a `tools/call` into the
API it is part of.

Part of, rather than in front of, is the whole design. A separate gateway would
have to forward the caller's token to an API that pins its own audience, so
every call would be refused; and forwarding it is the passthrough the MCP
specification forbids. Here the token a client obtains for `/mcp` is the token
every tool call runs under, `PrincipalGuard` verifies it once at the edge like
any other route, and authorization is the same `PermitGuard` and the same group
check.

## The modular monolith

Each `*-api` package is a self-contained NestJS module: its own controllers and
services, its own drizzle schema and migration chain with its own journal table,
its own OpenAPI document in the Scalar portal, and a `forRoot()` that takes
exactly the configuration it needs. `apps/api` binds them and provides the
access pipeline globally.

They do not import each other. A package depends on `platform-contracts`,
`platform-common`, `platform-authorization` and the identity guard, plus the
capability packages it uses (`platform-metadata`). `platform-authorization` is
deliberately not an `-api` package: it serves no routes and publishes no
document, so depending on it never means depending on a package that serves
`/orgs`.

The edges between API packages are few and each is one direction only.
`objects-api`, `rules-api` and `analysis-api` read through `graph-api`, which is
what makes them facades rather than second stores. `admin-api` delegates to
`tenancy-api` and `users-api`, because it owns no row of its own. And
`users-api` and `audit-api` are the two leaves: they own the `user` and
`audit_event` tables, and the packages that join a name or record an event
depend on them. Neither depends back, which is what keeps the direction honest —
both used to define their table in `platform-common` so that nothing had to,
and the result was a package with no domain owning two domains' tables.

`users-api` itself depends on nothing but the kernel now. Deleting a profile
revokes every standing it holds and `/me/groups` resolves what the caller
reaches, and both are questions about the group tree, which the kernel owns.

Cross-slice references are plain uuids, not foreign keys, which is what makes a
slice movable: today every one of them points at the same Postgres via
`DATABASE_URL`, and each migrator already honours a per-slice override
(`FILES_DATABASE_URL`, `THREADS_DATABASE_URL`, ...) for the day one is split
out.

The tradeoff is real and worth naming. One deployable means one blast radius, a
shared connection pool, and no independent scaling; what it buys is that a
graph write and its audit row commit or roll back together, which across a
network hop they would not. Promoting a package to its own service is a wiring
change rather than a rewrite, so the decision stays reversible.

`packages/common` is the layer beneath all of them: cursor and offset
pagination, the filter grammar, scope predicates, the drizzle appliers, the
migrate CLI, and the NestJS bits (swagger decorators, the exception filter). It
holds no domain knowledge, and nothing in it may mention orgs, files or graphs.

## Provisioning

The platform stores its own `user` row and keys everything on `user.id`, never
on the identity subject. The subject belongs to the identity provider and
changes for the same person when that provider does, so an audit log or an
`actor_id` keyed on it would lose every historical actor the day the provider is
swapped.

Kratos hooks call `POST /webhooks/identity` after registration and after a
settings change, and `DELETE /webhooks/identity/:externalId` when a person
closes their own account, authenticated by a shared secret both estates hold.
The staff console deletes through `DELETE /admin/users/:userId` instead, as the
operator rather than as the identity provider. Without it every
authenticated caller fails `PRINCIPAL_NOT_PROVISIONED`, because no user row is
ever written. It is optional locally, where the hook goes unexercised, and
required in every deployed environment.

## Degradation is configured, not coded

Several capabilities are off unless an environment gives them somewhere to
land, and the module answers `503` on the affected routes rather than failing to
boot. This is what makes an environment cheap to stand up, and it is the single
biggest source of "why does this work on dev and not here":

| Unset                | What goes dormant                                                       |
| -------------------- | ----------------------------------------------------------------------- |
| `GRAPH_DB_URI`       | `/graph/query` answers 503; the sync worker sleeps and `graph_version` accumulates rows it replays later |
| `FILE_STORAGE_BUCKET`| File byte operations answer 503; folder operations keep working          |
| `PINECONE_API_KEY`   | Documents are stored but not searchable; index routes answer 503         |
| `LLM_ENABLED`        | The run worker sleeps and thread runs sit `queued`; a client may finalize them itself |

The identity variables are the deliberate exception. `OIDC_ISSUER`,
`PUBLIC_URL`, `KETO_READ_URL` and `KETO_WRITE_URL` are read with `requireEnv`,
so a missing one refuses to boot. Their plausible localhost defaults would
otherwise produce a service whose health check is green and whose every gated
route answers 401, which reads as a bug in the caller.

## Data

**Postgres** is the system of record for everything, including the graph. One
Cloud SQL instance per environment; each package owns its tables and journals
its migrations separately, so `pnpm --filter @aec-craft/api db:migrate` runs
them in dependency order and each slice reports its own status.

**Memgraph** holds a one-way projection of the graph, fed by an in-process
worker from the `graph_version` log. It exists for the traversal workloads
recursive CTEs handle badly (weighted shortest path, connectivity,
arbitrary-depth patterns) and is never written to directly.
[`graph.md`](graph.md) is the full model.

**Object storage** holds file bytes, which never pass through the API: a create
hands out a signed capability, the client sends the bytes to the bucket, and
`complete` confirms the object landed. GCS by default, any S3-compatible
service behind the same seam.

## What is deliberately elsewhere

- **Identity and authorization storage**: buildOS ID owns Kratos, Hydra, Keto
  and the permission model. This repository owns the only code that writes Keto
  tuples, because the escalation guard and the audit row live with the write.
  The client is `platform-authorization`'s; the writes are `tenancy-api`'s.
- **The design system**: `@aec-craft/ui`, published from `aec-craft/ui`.
- **The LOCUS framework itself**: specified upstream in `aec-craft/locus`.
  `packages/contracts/src/graph` is this platform's binding of it.
