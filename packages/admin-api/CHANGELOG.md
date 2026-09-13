# @aec-craft/platform-admin-api

## 0.1.0

### Minor Changes

- [#286](https://github.com/aec-craft/platform/pull/286) [`e534e18`](https://github.com/aec-craft/platform/commit/e534e18cb4fec3525b3c9d30a119fe0537f35643) Thanks [@mariusjb](https://github.com/mariusjb)! - `DELETE /admin/users/:userId` and `admin.users.delete`: the staff console's half of removing an identity, called before the identity goes so a last owner is refused with `USER_DELETE_BLOCKED_LAST_OWNER` while there is still an account to hand over from. `GET /admin/users` gains an `externalId` filter, so the console can find the profile from the identity id it holds.

### Patch Changes

- Updated dependencies [[`e534e18`](https://github.com/aec-craft/platform/commit/e534e18cb4fec3525b3c9d30a119fe0537f35643)]:
  - @aec-craft/platform-contracts@0.7.0
  - @aec-craft/platform-authorization@0.0.0
  - @aec-craft/platform-common@0.0.0
  - @aec-craft/platform-tenancy-api@0.0.0
  - @aec-craft/platform-users-api@0.0.0

## 0.0.2

### Patch Changes

- Updated dependencies [[`660235b`](https://github.com/aec-craft/platform/commit/660235b1e99104a2affa259e448c1fcfc5d9101e), [`e687ddb`](https://github.com/aec-craft/platform/commit/e687ddb112e9d4c63002499dbff130db5b774d70), [`fb72e69`](https://github.com/aec-craft/platform/commit/fb72e6900e6f6bf2f0a0e407fa6ba69815f8c575)]:
  - @aec-craft/platform-contracts@0.6.0
  - @aec-craft/platform-authorization@0.0.0
  - @aec-craft/platform-common@0.0.0
  - @aec-craft/platform-tenancy-api@0.0.0
  - @aec-craft/platform-users-api@0.0.0

## 0.0.1

### Patch Changes

- Updated dependencies [[`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`e96e3c9`](https://github.com/aec-craft/platform/commit/e96e3c926aef1f601a8a2778dd2a6be9ed51a9d9), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b), [`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b)]:
  - @aec-craft/platform-contracts@0.5.0
  - @aec-craft/platform-errors@0.2.0
  - @aec-craft/platform-authorization@0.0.0
  - @aec-craft/platform-common@0.0.0
  - @aec-craft/platform-tenancy-api@0.0.0
  - @aec-craft/platform-users-api@0.0.0
