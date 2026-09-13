# @aec-craft/platform-cbm-ifc

## 0.1.2

### Patch Changes

- Updated dependencies [[`e534e18`](https://github.com/aec-craft/platform/commit/e534e18cb4fec3525b3c9d30a119fe0537f35643)]:
  - @aec-craft/platform-contracts@0.7.0
  - @aec-craft/platform-cbm-engine@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`660235b`](https://github.com/aec-craft/platform/commit/660235b1e99104a2affa259e448c1fcfc5d9101e), [`e687ddb`](https://github.com/aec-craft/platform/commit/e687ddb112e9d4c63002499dbff130db5b774d70), [`fb72e69`](https://github.com/aec-craft/platform/commit/fb72e6900e6f6bf2f0a0e407fa6ba69815f8c575)]:
  - @aec-craft/platform-contracts@0.6.0
  - @aec-craft/platform-cbm-engine@0.1.1

## 0.1.0

### Minor Changes

- [#209](https://github.com/aec-craft/platform/pull/209) [`e96e3c9`](https://github.com/aec-craft/platform/commit/e96e3c926aef1f601a8a2778dd2a6be9ed51a9d9) Thanks [@mariusjb](https://github.com/mariusjb)! - Two packages that turn an IFC file into a cognitive building model.

  `platform-cbm-engine` executes declarations it does not own. It maps source instances through a format profile's table, runs whatever derive passes it is handed, and emits one idempotent changeset. It knows about no file format and ships no passes; `PassContext` is an open record so a host brings its own. Ids are derived rather than allocated, so a re-import converges instead of duplicating.

  The working graph's element types are `WorkingNode` and `WorkingEdge`: mutable, mid-pipeline, always carrying a derived id. Distinct from `GraphNodeOp` in contracts, which is a wire operation, and from `GraphNodeRow` in graph-api, which is what is persisted.

  `platform-cbm-ifc` is IFC organised by mechanism rather than by entity taxonomy: ten folders, each documenting what IFC states, what we make of it, and what we deliberately drop. Semantics only, by design. It reads entities, relationships, property sets, quantities and units, and never streams a mesh or measures anything. A host that has geometry matches an element through `localId`.

### Patch Changes

- Updated dependencies [[`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b), [`e96e3c9`](https://github.com/aec-craft/platform/commit/e96e3c926aef1f601a8a2778dd2a6be9ed51a9d9), [`e96e3c9`](https://github.com/aec-craft/platform/commit/e96e3c926aef1f601a8a2778dd2a6be9ed51a9d9), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b), [`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b)]:
  - @aec-craft/platform-contracts@0.5.0
  - @aec-craft/platform-cbm-engine@0.1.0
