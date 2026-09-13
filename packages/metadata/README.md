# @aec-craft/platform-metadata

The metadata capability: a dotted-key-path KV surface (`apps.platform.theme`)
over any table carrying a free-form `metadata` jsonb bag.

## What it gives you

- **Path math** — `parseMetadataKeyPath`, `setAtPath`, `deleteAtPath`: pure,
  immutable, unit-testable without a database.
- **`SetMetadataDto`** — the shared `PUT …/metadata/:keyPath` body.
- **`MetadataStore`** — locked read-modify-write (`SELECT … FOR UPDATE`), bound
  to a drizzle table at construction; that binding is the only place a domain
  name appears. An optional hook runs in the same transaction, so audit writes
  commit or roll back with the write.

```ts
private readonly store = new MetadataStore(this.db, {
  table: org,
  notFound: new PlatformError(OrgErrors.NOT_FOUND),
});

this.store.write(orgId, (bag) => setAtPath(bag, path, value), {
  hook: (tx, row) => this.audit.record(tx, { ... }),
});
```

## Layout

| Path                     | What lives there                          |
| ------------------------ | ----------------------------------------- |
| `src/metadata.paths.ts`  | the pure path math                        |
| `src/metadata.store.ts`  | the locked read-modify-write store        |
| `src/metadata.dto.ts`    | the shared request body                   |
