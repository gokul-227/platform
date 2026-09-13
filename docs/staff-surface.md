# The staff surface

Everything at `/admin/*`. One package serves it, one SDK calls it, and nothing
about it is a customer's to discover.

## What it is

`@aec-craft/platform-admin-api` serves nine read-and-settings routes across
every tenant in the estate:

| Route | |
| --- | --- |
| `GET /admin/orgs` | every organization |
| `GET /admin/orgs/{orgId}` | one, unmasked |
| `PATCH /admin/orgs/{orgId}` | name and slug |
| `GET /admin/projects` | every project, every tenant |
| `GET /admin/orgs/{orgId}/projects` | every project in one tenant |
| `GET /admin/projects/{projectId}` | one, unmasked |
| `PATCH /admin/projects/{projectId}` | name and slug |
| `GET /admin/users` | every person |
| `GET /admin/users/{userId}` | one |
| `DELETE /admin/users/{userId}` | the profile and its standings; refused for a last owner |

## How it is guarded

`StaffGuard` class-wide, and **no route declares a permit**. That pairing is the
whole authorization story: the global `PermitGuard` returns true for a route with
no `@RequirePermit`, so the staff gate is the only thing standing there, which is
why it is applied to the class and never to a method.

The gate reads `principal.staffRole`, which the Kratos admin API writes into
`metadata_public` and nothing else can. Consent puts no console role into an
OAuth grant, so a client-credentials token, a delegated token and an MCP token
cannot reach any of this whatever scopes they hold. That is a property of the
identity estate rather than a rule enforced here.

Refusals are `ACCESS_STAFF_REQUIRED` (403). The surface answers no
`PERMISSION_FORBIDDEN` and no `PERMISSION_UNAVAILABLE`, because nothing here
reaches Keto: the lists are Postgres, and the one group lookup on a write is a
table query rather than a check.

## Three ways it differs from the ordinary routes

**Lists carry no visibility predicate.** `OrgService.list` and
`ProjectService.list` take a scope argument — `{ type: "readableBy", principal }`
from the tenant route, `{ type: "estate" }` from this one — and the estate branch
applies no `group_id IN (...)`. One query, one paginator, the reach named at the
call site. It is an argument the controller writes, never a request field, so a
caller cannot widen a list by sending anything.

**A 404 means absent.** On a tenant route `ORG_NOT_FOUND` does double duty
through `assertCanOrMask`: the row is missing, or it is real and invisible to
you. Nothing is masked here, so the code is unambiguous, which is the one place
it is.

**Writes are the ordinary writes.** `PATCH` delegates to the owning package's
service, so a staff member's change takes the same transaction and leaves the
same audit row a tenant's own administrator would, naming them as the actor.

## What is deliberately absent

- **Creating a tenant.** It would make the staff member its first owner.
- **Deleting a tenant or a project.** Irreversible, and deleting an org destroys
  the record of everything that happened inside it. Both want their own
  operation with a reason attached, and a retention window rather than a
  permission tier.
- **Membership writes.** A standing is changed through
  `POST /orgs/:orgId/members`, so `assertMayGrant` runs and the grant leaves an
  audit row. A mirror of that route would skip both, which is the dangerous kind
  of mirror.
- **The data plane.** No files, no graph, no threads, no rules, no objects, no
  analysis. A staff member cannot read a customer's model through this package,
  and that is a sentence worth being able to say without qualification.

## Why a second package rather than a wider guard

The alternative was escalating inside `AuthorizationService.can()`, which every
guard and every list already funnels through. Two conditions there would have
given staff the whole platform with no new routes at all.

It was rejected because `can(principal, permit, groupId)` is resource-blind by
design: it cannot tell an org's settings from somebody's IFC model, so one
escalation value hands over the data plane along with the control plane. Mirroring
the control plane is more code and a smaller promise.

If a staff member ever genuinely needs to open a customer's model to debug it,
impersonation is the pattern to copy rather than a wider standing: act as a named
user in one tenant, time-boxed, with the reason recorded.

## Not in the portal

`adminApiDocument` sets `portal: false`, so nothing is served at
`/openapi-admin` and nothing appears in `/docs`. It stays in `API_DOCUMENTS`
because the conventions and validation gates read generated documents rather than
source: a module in no document is checked by nothing, and these routes have no
permit guard in front of them to parse anything.

## Calling it

`@aec-craft/platform-admin-sdk`, separate from `@aec-craft/platform-sdk` so the
routes and shapes of an internal console are not in the tarball product teams
download. It depends on the platform SDK for the transport, so auth, retries and
error mapping are not duplicated.

```ts
const admin = new AdminClient({ baseUrl, getAuthHeaders });
const everyTenant = await admin.orgs.list();
```

React bindings under `./react`. `AdminProvider` carries no `QueryClient` of its
own, so it nests inside the platform SDK's provider and both share one cache;
keys root under `["admin"]` rather than `["platform"]`, so a console can clear
the staff cache without dropping the product one.

## The gate that keeps the surfaces honest

`apps/api/tests/e2e/surface.coverage.e2e.test.ts` asserts three things against
the generated documents:

1. every published route has an SDK method, or is named in that file as one that
   deliberately does not (the 501 rule-extraction scaffolds, and run streaming,
   which goes through the streaming transport)
2. nothing is named as uncovered that the server no longer serves
3. every MCP tool endpoint is a route the server serves

The SDK half is observed rather than parsed: several clients build their path
through a helper, so reading the source finds an interpolated template and cannot
tell which route it is. Every method is invoked against a recording transport
instead, and the URL it actually produces is what gets compared.
