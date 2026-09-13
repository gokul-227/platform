# Platform documentation

The product backend for buildOS. Orgs and projects, the files in them, the
building-data graph over those files, and the chat threads that query it.

Identity is a separate estate: buildOS ID
([`aec-craft/platform-id`](https://github.com/aec-craft/platform-id)) answers
who someone is and which application may ask. This repository answers what they
may reach.

## Read in this order

| Document                                             | What it answers                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)                   | The shape of the system, how a request is decided, why one deployable, what goes dormant and when |
| [authorization.md](authorization.md)                 | Groups, standings and permits; why scope and ownership are different columns; how to enforce it in a module |
| [local-development.md](local-development.md)         | Getting the stack running, calling the API as somebody, what the tests need       |
| [list-filter-framework.md](list-filter-framework.md) | The one way every collection endpoint paginates, filters and sorts                |
| [cognitive-building-model.md](cognitive-building-model.md) | What the nodes mean: the vocabulary, node types, block and edge conventions, rules and verdicts |
| [graph.md](graph.md)                                 | The engine under it: storage, the changeset write surface, versioning, the projection |
| [staff-surface.md](staff-surface.md)                 | `/admin/*`: what staff may reach across every tenant, how it is gated, and what it deliberately cannot do |
| [deployment.md](deployment.md)                       | What deploys where, on which trigger, and how to roll back                        |
| [operations.md](operations.md)                       | Standing an environment up, wiring GitHub to GCP, secrets and rotation            |

Per-package detail lives in that package's own README: what it owns, its
routes, its layout, and how the host consumes it. Conventions for humans and
agent tools are in [`AGENTS.md`](../AGENTS.md).

## The five things worth knowing on day one

1. **A row's owner is a group, not its partition.** `group_id` is the only input
   to an authorization check. `org_id` / `project_id` are for filtering and
   isolation, and no check reads them.
2. **One definition per wire shape**, in `packages/contracts`. The server
   validates against it, the SDK types against it, the MCP descriptors point at
   it. Add a shape anywhere else and it is drift by construction.
3. **`apps/api` is one deployable made of packages.** Each `*-api` package owns
   its tables, its migrations and its OpenAPI document; the host binds them and
   installs the access pipeline globally.
4. **Capabilities degrade rather than fail to boot.** No graph database, no
   bucket, no index, no model: the routes answer `503` and the rest of the API
   works. Identity configuration is the deliberate exception and refuses to
   start.
5. **A denial and a missing row look the same.** Rows you cannot reach are
   absent from listings, because saying one exists is itself the disclosure.

The graph has two specs because it has two layers.
[cognitive-building-model.md](cognitive-building-model.md) is authoritative for
what a node means; [graph.md](graph.md) is authoritative for how it is stored,
versioned, projected and served.

## Open work

GitHub Issues, with one-line `TODO(#123):` pointers in the code next to what
they affect. Anything a comment would have explained at length lives in the
issue instead.
