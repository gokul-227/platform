# Authorization

Who may do what, and where that decision is stored. The model is shipped; this
describes it as built.

buildOS ID owns the store (Ory Keto) and the namespace model
(`@aec-craft/platform-id-permissions`). This repository owns the only code that
writes into it, because the escalation guard and the audit row belong in the
same transaction as the write.

## Three words, three jobs

| Word         | What it is                                    | Where it lives                      |
| ------------ | --------------------------------------------- | ----------------------------------- |
| **group**    | a set of subjects, each holding a standing    | the `group` table, Keto's `Group` namespace |
| **scope**    | which tenant and which project a row sits in  | `org_id` / `project_id` on every row |
| **standing** | what a subject holds on a group               | a Keto relation (`owners`, `editors`, ...) |

The middle row is the one to internalise. **Scope is not authorization.** It
says where a row lives, for filtering, listing, tenant isolation and audit. No
check ever reads it.

Every row therefore carries both:

```
group_id   uuid not null    who this row answers to     -> the only check input
org_id     uuid not null    tenant partition            -> filtering, isolation
project_id uuid null        delivery boundary           -> filtering
```

`org_id` and `project_id` are copied from the group when the row is created.
They are denormalised on purpose: a list filters on them without a join, and a
check never touches them. A check is always the same shape and never involves a
lookup:

```
check(subject, permit, row.group_id)
```

## Standings and permits

Five standings, highest first: `owner > admin > manager > editor > viewer`.
Five permits: `read`, `write`, `manage`, `admin`, `own`. Each permit has a
floor on the ladder, and each standing falls through to the ones below it, so an
owner needs no editor grant to write.

| Permit   | Floor     | Covers                                          |
| -------- | --------- | ----------------------------------------------- |
| `read`   | `viewer`  | sees the group's rows                           |
| `write`  | `editor`  | mutates them, update and delete alike           |
| `manage` | `manager` | membership and locks                            |
| `admin`  | `admin`   | the lifecycle of what sits inside the tenant    |
| `own`    | `owner`   | the tenant's own existence, and its bill        |

There is no role table and no permission catalog. A group is a set of users; a
standing is which relation that set holds; the breadth of what they hold it over
is the only difference between "owner of the org" and "editor at Acme MEP".

`admin` exists to split the tier that runs a tenant from the tier that owns it.
A firm's principal is usually not the person doing the work, and without the
split, enough standing to create a project was also enough to delete the
organization and unseat them.

**The escalation guard**: you may grant strictly below your own standing, so the
administration chain deepens only by a decision from above it. An owner may
appoint a peer, which is the one documented exception; without it an org created
with one owner could never gain a second, and ownership transfer would need an
operation outside the rule to exist at all. An admin appointing another admin is
not a second exception, it follows from the rule, and it has to work: the case
the tier exists for is an absent owner.

The vocabulary and the guard are one file,
`packages/contracts/src/tenancy/groups/standing.ts`. Read it before changing
anything here.

## The parent edge is the oversight switch

A group may name a parent. Staff above reach down into it, which is what makes
"org owners administer everything in their tenant" a property of the model
rather than a bypass. Every permit traverses that edge.

One nullable column gives two flavours of restricted. Only the two partition
groups exist today, so every project group has a parent and every org root has
none; the flavours below are the model the tuples already carry, and the surface
that lets somebody choose between them arrives with Teams:

- **Restricted** (`parent_id` set): the named people, plus anyone with standing
  above. A project manager and an org owner still reach it. This is the right
  default, and it is what compliance, handover and "the person who set this up
  left" all require.
- **Confidential** (`parent_id` null): only the named people. Nobody reaches it
  from above, because there is no edge to traverse. Keto has no deny rule and
  does not need one here: absence of a parent *is* the isolation.

The last-owner guard stops being a nicety once confidential groups exist. A
group with no owner and no parent can be administered by nobody, and its rows
become unreachable forever, so removing the last owner is refused. It binds on
an org's root group and on a group made outside the tree, and nowhere else: an
owner reachable from above already satisfies what it protects.

Two properties of the OPL matter enough to restate, both learned the hard way:

- **Each permit is a union of relations plus one parent traversal, never a call
  to the permit above it.** Keto spends expansion budget per link, so a ladder
  costs a level of reach per rung and silently produces an owner who can
  administer what they cannot read.
- **`read` traverses the parent's `write`, not the parent's `read`.** A parent
  group's viewer set is where every contractor roster lands, so following `read`
  upward arrives in a set fed by the children and comes back down into every
  sibling. `write` never admits a viewer, so traversing it carries staff down
  and nobody sideways. The consequence to know: `read` descends for editors and
  above, not for a pure viewer, and visibility between peers stays an explicit
  share.

`limit.max_read_depth` must be set explicitly in `keto.yml`, sized above the
deepest group chain. Exhausting it is answered as a denial, not an error.

## What is stored where

One Postgres table, because Keto already holds everything else. Membership and
the grants between groups are tuples, and Keto both stores and lists them: one
call filtered by object returns every standing on a group, one filtered by
subject returns every group a subject stands in. Mirroring those would be a
second copy with nothing keeping it honest, so there is no `group_member` table
and no `group_grant`.

What Keto genuinely cannot answer is what a group *is*. It knows
`Group:<uuid>` as an opaque string with no name, no type and no place in a
tenant, and a group with no tuples does not exist there at all. The `group`
table is that missing half: display name, slug, type (`org` / `project` /
`custom`), the org/project spine, and the parent edge. The parent edge is the
one thing written twice, because the alternative is paging Keto's whole
namespace every time a tree renders.

Tuple writes are domain side effects, not seed data. A grant is expressed as
delete-then-write: the domain operation is "give this subject this standing",
which is idempotent by intent, and a promotion already requires the delete
(adding alone never demotes). It matters because Keto's
`PUT /admin/relation-tuples` is not idempotent, and the same tuple written twice
is stored twice.

## The API

```
GET    /orgs/:orgId/members             everyone in the tenant, with their standing
POST   /orgs/:orgId/members             { email | subject, standing }
PATCH  /orgs/:orgId/members/:subjectId
DELETE /orgs/:orgId/members/:subjectId

GET    /projects/:projectId/members     the same, plus who the org carries down
POST   /projects/:projectId/members
PATCH  /projects/:projectId/members/:subjectId
DELETE /projects/:projectId/members/:subjectId

GET    /me/groups                       what the caller holds, as permits
```

A membership is a membership *of* a partition, so it nests. The nesting is what
lets `@RequirePermit` resolve the partition before the body is parsed, which is
also why a body names no tenant, and it is what lets the two collections answer
`ORG_NOT_FOUND` and `PROJECT_NOT_FOUND`: a caller who cannot see the partition
is told the partition is absent, and never that a group exists.

Reading needs `read` and every write needs `manage`. `read` is the change from
what came before, where the list was `manage`-only on the grounds that who else
is on a job is not every viewer's business. It is the tenant directory now: it
is what puts a name to the author of a file and the actor on an audit row, and
both of those surfaces are read by people holding `read` and nothing more.

The surface lives in `tenancy-api`, beside the orgs and projects whose members
these are. `platform-authorization` owns the table, the tuples and the decision,
and serves no routes at all.

`group` does not appear on it. It is how the kernel stores a partition, it is
created and destroyed with the org or the project it backs, and the only places
it still reaches a caller are `groupId` on a create body, which hands a row to
somebody other than the scope's own people, and `/me/groups`, which is named for
what it reads and will be renamed with it. A set of people spanning projects
arrives later as **Teams**, and Teams is what re-opens the create surface these
two collections replaced.

The member list answers who *reaches* the partition, not who has a tuple on it.
Every permit traverses the parent, so an org owner administers a project without
standing in it, and a list of direct tuples would leave the person with the most
authority over a project invisible on it. Each row says `direct` or `inherited`,
and an inherited standing is changed on the organization.

## Enforcing it in a module

Two shapes, and which one applies is decided by whether the group is known
before any row is read.

```ts
// The group is in the path. The guard resolves and checks it before the handler runs,
// and hands the handler the scope it resolved, so a create stamps the right group_id.
@RequirePermit("write")
@Post("orgs/:orgId/files")
create(...) {}

// A by-id route cannot: the group comes off the row. The service checks once it
// holds it. A decorator here would claim to run before the work it depends on.
const row = await this.findById(fileId);
await this.checks.assertCanRow(principal, "write", row);
```

Checks within a request share a memo, so a list that fans out over many groups
asks Keto for each one once. A list resolves to `group_id IN (readable groups)`,
where the candidate set comes from the `group` table filtered by
`org_id` / `project_id`. That is exactly what those columns are for.

Moving a row between groups (`PATCH /files/:fileId { groupId }`) requires
`write` on both: you may not push a row somewhere you cannot reach, and you may
not take a row you do not hold. Containers cascade to their descendants in the
same transaction, because a restricted folder whose contents stay visible is a
privacy bug rather than a feature.
