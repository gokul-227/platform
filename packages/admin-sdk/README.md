# @aec-craft/platform-admin-sdk

Typed client for the platform's staff surface, `/admin/*`.

Separate from `@aec-craft/platform-sdk` on purpose. That package ships to
product teams, and the routes and shapes of an internal console are not theirs
to read. This one depends on it for the transport, so nothing about auth,
retries or error mapping is duplicated here.

The surface itself is [`docs/staff-surface.md`](../../docs/staff-surface.md).

## Using it

```ts
import { AdminClient } from "@aec-craft/platform-admin-sdk";

const admin = new AdminClient({
  baseUrl: "https://api.example.com",
  getAuthHeaders: async () => ({ Authorization: `Bearer ${await token()}` }),
});

const everyTenant = await admin.orgs.list();
const one = await admin.orgs.findById(orgId);
await admin.orgs.update(orgId, { name: "Renamed" });
```

Same options as `PlatformClient`, so a console holding both passes one object to
each.

| Client | Methods |
| --- | --- |
| `admin.orgs` | `list`, `findById`, `update` |
| `admin.projects` | `list`, `listByOrg`, `findById`, `update` |
| `admin.users` | `list`, `findById`, `delete` |

`users.delete` is the console's half of removing an identity: it goes first, so
a last owner is refused (`USER_DELETE_BLOCKED_LAST_OWNER`, the blocking groups in
`details`) while the identity still exists to hand over from.

## React

```tsx
import { AdminProvider, useAdminOrgs } from "@aec-craft/platform-admin-sdk/react";

<PlatformProvider client={platform}>
  <AdminProvider client={admin}>{children}</AdminProvider>
</PlatformProvider>;
```

Every client method has a hook: `useAdminOrgs`, `useAdminOrg`,
`useCreateAdminOrg`, `useUpdateAdminOrg`, `useDeleteAdminOrg`; `useAdminMembers`,
`useAddAdminMember`, `useSetAdminMemberStanding`, `useRemoveAdminMember`;
`useAdminProjects`, `useAdminOrgProjects`, `useAdminProject`,
`useUpdateAdminProject`; `useAdminUsers`, `useAdminUser`, `useDeleteAdminUser`.
A mutation invalidates the lists it changed, so a console renders from the cache
and never refetches by hand.

`AdminProvider` carries no `QueryClient` of its own, so it nests inside the
platform SDK's provider and both clients share one cache. Keys root under
`["admin"]` rather than `["platform"]`, so signing a staff member out of the
console can clear the staff cache without dropping the product one.

## Every route needs a browser session

`StaffGuard` reads `principal.staffRole`, which the identity provider's admin API
writes and nothing else can. Consent puts no console role into an OAuth grant, so
a client-credentials token cannot reach any of this whatever scopes it holds. A
refusal is `ACCESS_STAFF_REQUIRED` (403); an unauthenticated call is
`ACCESS_PRINCIPAL_REQUIRED` (401).
