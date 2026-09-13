# Platform

The product backend for buildOS: organizations and projects, the files inside
them, the building-data graph over those files, and the chat threads that query
it. One REST API, multi-tenant, served at `api.platform.os.build`.

Identity is not here. Who someone is, and which application may ask, belongs to
buildOS ID ([`aec-craft/platform-id`](https://github.com/aec-craft/platform-id)).
This repository accepts that issuer's access tokens and answers what they may
reach.

## Layout

```
apps/
  api/          The only deployable. NestJS on Cloud Run; binds every API
                package and serves the MCP endpoint at POST /mcp.

packages/
  tenancy-api/      Orgs, projects, and who is in each
  users-api/        The `user` row: /me, the identity back-channel
  files-api/        File tree, direct-to-bucket uploads, document index
  graph-api/        Nodes, edges, changesets, versioning, the projection worker
  threads-api/      Chat threads, message log, generation runs
  audit-api/        The `audit_event` table, its writer, and the read feeds
  objects-api/      The object half of the graph, read-only
  rules-api/        The rule half of the graph, read-only
  analysis-api/     Named computations over a project's model
  admin-api/        The staff surface over other packages' rows

  authorization/    The group table, Keto, and the check every package calls
  graph-client/     The bolt driver and one read over the projection
  contracts/        Wire shapes: zod schemas, error catalogs, list specs, vocabulary
  query/            The list dialect: filters, pagination, the drizzle appliers
  common/           What every API package needs and no domain owns
  metadata/         Dotted-key-path metadata KV over a jsonb bag
  errors/           The error envelope and the catalogues common throws

  sdk/              Typed client, React hooks (./react), settings surface (./ui)
  admin-sdk/        The staff client, over the first one's transport
  mcp-tools/        MCP tool descriptors over the contracts, served at /mcp
  testing/          What every package's integration and e2e suites share
  cbm-engine/       The building model's own algorithms
  cbm-ifc/          IFC in, building model out
  typescript-config/  Shared tsconfig bases

docs/           Concepts, and the operational procedures worth writing down
infra/          Terraform for the three GCP environments
```

`apps/api` is a modular monolith. Every `*-api` package is a NestJS module with
its own tables, its own migration chain, and its own OpenAPI document; the host
binds them and installs the access pipeline globally. One deployable, one
database, module boundaries held at the package edge rather than at a network
hop. [`docs/architecture.md`](docs/architecture.md) says why, and what it costs.

Sibling repositories, all consumed as published packages: the identity provider
in [`aec-craft/platform-id`](https://github.com/aec-craft/platform-id), the
design system (`@aec-craft/ui`) in
[`aec-craft/ui`](https://github.com/aec-craft/ui), the graph engine and
building-data vocabulary (`@sparc/locus`) in
[`aec-craft/locus`](https://github.com/aec-craft/locus).

## Running it

Node 22 (`.nvmrc`), pnpm 10, Docker. The API needs an identity provider and an
authorization store to boot, and both live in the sibling repository, so the
short version is: bring up buildOS ID first, then this.

```sh
git clone https://github.com/aec-craft/platform-id ../platform-id
pnpm --dir ../platform-id install && pnpm --dir ../platform-id ory:up

pnpm install
pnpm build:packages          # the migrate CLIs are built bins; dist/ is gitignored
docker volume create auth_platform-postgres-data   # first time only; the volume is external
docker compose up -d         # Postgres on 5433 (5432 belongs to cloud-sql-proxy)
cp apps/api/.env.example apps/api/.env
pnpm --filter @aec-craft/api db:migrate
pnpm --filter @aec-craft/api dev     # http://localhost:3100/docs
```

[`docs/local-development.md`](docs/local-development.md) covers the rest: what
each optional switch turns on, how to get a token you can call the API with, and
what "dormant" looks like when a switch is off.

```sh
pnpm validate    # typecheck + lint
pnpm test        # every package
pnpm fix         # format + autofix, before committing
```

## Environments

Push to `main` deploys dev. A `vX.Y.Z-beta.N` tag deploys test. A `vX.Y.Z` tag
deploys prod behind a manual approval on the `prod` GitHub Environment. Each is
its own GCP project with its own database, bucket and registry; nothing is
shared at runtime.

| Env  | API                                                                                 | Deploys                                                               |
| ---- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| dev  | [api.dev.platform.os.build](https://api.dev.platform.os.build/health)               | [history](https://github.com/aec-craft/platform/deployments/dev)      |
| test | [api.test.platform.os.build](https://api.test.platform.os.build/health)             | [history](https://github.com/aec-craft/platform/deployments/test)     |
| prod | [api.platform.os.build](https://api.platform.os.build/health)                       | [history](https://github.com/aec-craft/platform/deployments/prod)     |

dev and test also still answer their old `platform.sparc.build` names while that
cutover finishes; prod was stood up after the move and never took one. The API
serves `/health`, `/ready`, `/version`, and the Scalar portal at `/docs` with
one OpenAPI document per package beneath it. `GET /` redirects there, unless
`API_DOCS_ENABLED=false` takes the portal out entirely.

Consoles: [Cloud Run](https://console.cloud.google.com/run?project=platform-dev-495017) ·
[Cloud SQL](https://console.cloud.google.com/sql/instances?project=platform-dev-495017) ·
[Logs](https://console.cloud.google.com/logs/query?project=platform-dev-495017)
(swap `dev` for `test` / `prod` in the project id).

## Documentation

Start with [`docs/README.md`](docs/README.md). Conventions for humans and agent
tools are in [`AGENTS.md`](AGENTS.md).

Open work is tracked in GitHub Issues; the code carries one-line `TODO(#123):`
pointers next to what they affect.
