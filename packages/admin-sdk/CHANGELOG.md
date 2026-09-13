# @aec-craft/platform-admin-sdk

## 0.2.0

### Minor Changes

- [#286](https://github.com/aec-craft/platform/pull/286) [`e534e18`](https://github.com/aec-craft/platform/commit/e534e18cb4fec3525b3c9d30a119fe0537f35643) Thanks [@mariusjb](https://github.com/mariusjb)! - `DELETE /admin/users/:userId` and `admin.users.delete`: the staff console's half of removing an identity, called before the identity goes so a last owner is refused with `USER_DELETE_BLOCKED_LAST_OWNER` while there is still an account to hand over from. `GET /admin/users` gains an `externalId` filter, so the console can find the profile from the identity id it holds.

- [#288](https://github.com/aec-craft/platform/pull/288) [`05f38d7`](https://github.com/aec-craft/platform/commit/05f38d702cef909fce49a7830d0c3733339fdad3) Thanks [@mariusjb](https://github.com/mariusjb)! - React bindings for every write on the staff surface: `useCreateAdminOrg`, `useDeleteAdminOrg`, `useDeleteAdminUser`, and the roster (`useAdminMembers`, `useAddAdminMember`, `useSetAdminMemberStanding`, `useRemoveAdminMember`). Each invalidates the lists it changed, so a console built on the hooks never refetches by hand.

### Patch Changes

- Updated dependencies [[`e534e18`](https://github.com/aec-craft/platform/commit/e534e18cb4fec3525b3c9d30a119fe0537f35643)]:
  - @aec-craft/platform-contracts@0.7.0
  - @aec-craft/platform-sdk@0.5.2

## 0.1.0

### Minor Changes

- [#272](https://github.com/aec-craft/platform/pull/272) [`660235b`](https://github.com/aec-craft/platform/commit/660235b1e99104a2affa259e448c1fcfc5d9101e) Thanks [@mariusjb](https://github.com/mariusjb)! - Staff can set a customer up with their first organization and remove one:
  `AdminClient.orgs.create` names the owner rather than becoming one, and
  `AdminClient.orgs.delete` removes a tenant.

- [#269](https://github.com/aec-craft/platform/pull/269) [`e687ddb`](https://github.com/aec-craft/platform/commit/e687ddb112e9d4c63002499dbff130db5b774d70) Thanks [@mariusjb](https://github.com/mariusjb)! - Staff can administer a tenant's roster: `AdminClient.members` reaches
  `/admin/orgs/{orgId}/members`, and an audit event now says whether a change came
  through the staff surface (`actorIsStaff`).

### Patch Changes

- Updated dependencies [[`660235b`](https://github.com/aec-craft/platform/commit/660235b1e99104a2affa259e448c1fcfc5d9101e), [`e687ddb`](https://github.com/aec-craft/platform/commit/e687ddb112e9d4c63002499dbff130db5b774d70), [`fb72e69`](https://github.com/aec-craft/platform/commit/fb72e6900e6f6bf2f0a0e407fa6ba69815f8c575)]:
  - @aec-craft/platform-contracts@0.6.0
  - @aec-craft/platform-sdk@0.5.1

## 0.0.1

### Patch Changes

- Updated dependencies [[`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b), [`e96e3c9`](https://github.com/aec-craft/platform/commit/e96e3c926aef1f601a8a2778dd2a6be9ed51a9d9), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b), [`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b)]:
  - @aec-craft/platform-contracts@0.5.0
  - @aec-craft/platform-sdk@0.5.0
