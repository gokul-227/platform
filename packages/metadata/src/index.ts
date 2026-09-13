// `@aec-craft/platform-metadata` — the metadata capability: dotted-key-path KV over
// any table carrying a free-form `metadata` jsonb bag. Domain-blind; a domain
// binds its table when constructing a `MetadataStore`.

export { SetMetadataDto } from "./metadata.dto";
export {
  deleteAtPath,
  type MetadataBag,
  parseMetadataKeyPath,
  setAtPath,
} from "./metadata.paths";
export {
  type MetadataCarrierTable,
  MetadataStore,
  type MetadataStoreOptions,
  type MetadataTransaction,
  type MetadataWriteOptions,
} from "./metadata.store";
