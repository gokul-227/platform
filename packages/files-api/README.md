# @aec-craft/platform-files-api

The org/project file tree with direct-to-bucket uploads, embedded in the
`apps/api` host. Bytes never pass through the API: create hands out a capability
for the bucket, the client sends the bytes there, and `complete` confirms the
object landed.

The service owns **content**; the platform owns **meaning**. It knows nothing
about the graph, requirements, or buildings. Org-scoped files form a shared
library that hydrates read-only into project listings.

## Routes

| Method | Path                        | Notes                                  |
| ------ | --------------------------- | -------------------------------------- |
| GET    | `/orgs/:orgId/files`        | one folder level of the org's shared library |
| GET    | `/projects/:projectId/files`| one folder level; hydrates the org library, `?scope=` narrows |
| POST   | `/orgs/:orgId/files`        | folder, or a `pending` file + upload ticket, in the library |
| POST   | `/projects/:projectId/files`| the same, landing in the project       |
| GET    | `/files/presets`            | what may come in, so a client can reject a file locally |
| GET    | `/files/:fileId`            | scope resolved from the row            |
| PATCH  | `/files/:fileId`            | rename / move; content is immutable    |
| DELETE | `/files/:fileId`            | folders delete their subtree + objects |
| POST   | `/files/:fileId/complete`   | verify the object, flip to `ready`     |
| GET    | `/files/:fileId/upload`     | the live upload session, to resume     |
| POST   | `/files/:fileId/abort`      | abandon a pending upload               |
| GET    | `/files/:fileId/download`   | short-lived signed download URL        |
| PUT    | `/files/:fileId/metadata/:keyPath` | merge-write one key into the bag |
| DELETE | `/files/:fileId/metadata/:keyPath` | remove one key                  |

Without `fileStorage` configured, byte operations answer 503
`FILE_STORAGE_UNAVAILABLE`; folder operations keep working.

## Document index

Uploads made under the `document` preset become searchable by meaning and by
term, and can be cited. The index is optional: without it every route below
answers 503 and files are still stored and downloadable.

| Method | Path                                   | Notes                                        |
| ------ | -------------------------------------- | -------------------------------------------- |
| GET    | `/files/:fileId/index`                 | this file's index state                      |
| POST   | `/files/:fileId/index`                 | submit it for indexing                       |
| DELETE | `/files/:fileId/index`                 | remove it from the index                     |
| GET    | `/files/:fileId/index/text`            | the extracted text                           |
| POST   | `/orgs/:orgId/files/search`            | ranked hits across the org library           |
| POST   | `/projects/:projectId/files/search`    | the same, across a project                   |
| POST   | `/orgs/:orgId/files/retrieve`          | the passages behind those hits               |
| POST   | `/projects/:projectId/files/retrieve`  | the same, across a project                   |
| POST   | `/orgs/:orgId/files/context`           | those passages assembled as prompt context   |
| POST   | `/projects/:projectId/files/context`   | the same, across a project                   |
| POST   | `/orgs/:orgId/files/ask`               | a grounded answer with its citations         |
| POST   | `/projects/:projectId/files/ask`       | the same, across a project                   |

Retrieval runs under the caller's own authorization predicate, the same one a
file listing uses, so a document nobody granted you is not in your results and
cannot be cited back at you.

## Uploads

Small files get one signed `PUT`. Anything above `resumableThresholdBytes` gets
the interruptible shape its backend speaks — a **resumable session** on GCS
(chunks of `chunkSizeBytes`, the bucket holding a growing prefix) or a
**multipart upload** on S3 (independent parts to presigned URLs). Either way an
upload survives a pause, a dropped connection, or a page reload; they differ only
in what the client asks the bucket on the way back — the committed offset, or
which parts already landed.

A client that cannot name a file's type sends the generic one and the server
resolves it from the extension, because presets validate the declared type and
the guess belongs with the check rather than in each client.

A create may name the preset it wants to be held to (`preset`, `default` when
omitted), so a per-purpose limit is enforced here and not only checked in the
browser. A name the deployment does not offer answers `FILE_PRESET_NOT_FOUND`
rather than falling back, which would grant more than the caller asked for.

`file_upload` holds one row per in-flight upload — the strategy, the session URI,
and a deadline — and is gone the moment the bytes are confirmed:

- **Resume.** `GET /files/:fileId/upload` returns the session again — a `put` is
  re-signed, a multipart ticket comes back holding only the parts that have not
  landed. Nothing about a resume needs the original request's memory, so a reload
  or a different device works.
- **Exactly once.** `complete` claims the session with a conditional
  `pending -> completing` update, so two concurrent calls cannot both verify the
  same upload. Every failure releases the claim, leaving the upload retryable: a
  `complete` that arrives before the last bytes answers `FILE_UPLOAD_NOT_FOUND`
  and can simply be called again.
- **Verification.** The object is HEAD-checked against the declared size before
  the row turns `ready`; a mismatch removes the bytes.
- **Expiry.** `FileUploadSweeper` cancels sessions past their deadline and
  removes the pending rows behind them, so an abandoned upload cannot hold a
  session or a row that never clears.

The session URI is a write capability on its own: it is returned to the caller
that created or re-fetched its own upload, and never appears in a listing.

## Layout

| Path                              | What lives there                          |
| --------------------------------- | ----------------------------------------- |
| `src/config/`                     | `FilesApiModule.forRoot()` + `Config`     |
| `src/database/`                   | drizzle schema (`file`, `file_upload`)    |
| `src/modules/`              | controller, service, sweeper, content-type resolution, permission guard, DTOs |
| `src/modules/storage/`      | the `FileStorage` seam: GCS, S3, null impls |
| `src/modules/index/`        | the document index: seams, providers, worker, ladder |
| `src/modules/metadata/`     | the metadata KV sub-resource              |
| `src/nest/`                       | NestJS bindings + the OpenAPI document spec |
| `drizzle/`                        | migrations, journaled separately from every other slice |
| `bin/files-api-migrate`           | the migrate CLI                           |
| `compose.index.yaml`              | the local Pinecone emulator               |

## Consuming

```ts
@Module({
  imports: [
    AuthorizationModule.forRoot({ databaseUrl, ketoReadUrl, ketoWriteUrl }),
    FilesApiModule.forRoot({
      databaseUrl: FILES_DATABASE_URL,
      fileStorage: {
        provider: "gcs",
        bucket: FILE_STORAGE_BUCKET,
        // Defaults: 8 MiB threshold and chunk, 24h session TTL.
        origin: APP_ORIGIN, // browser origin for the session's CORS preflight
      },
      presets: [{ name: "default", maxFileSizeBytes: 5 * 1024 ** 3 }],
    }),
  ],
})
```

Authorization runs in the kernel's `RowPermitGuard` over the host's global
`AuthorizationModule`: a by-id route reads the row, takes the group off it, and
checks that. The client half of the upload protocol (chunking,
pause/resume, offline recovery) lives in `@aec-craft/platform-sdk`.

## Storage backends

Nothing above the `FileStorage` seam knows which backend is running: the
strategy shapes belong to the seam, not to a vendor, and the client engine
switches on the ticket's `type`.

```ts
fileStorage: {
  provider: "s3",
  bucket: FILE_STORAGE_BUCKET,
  region: "auto",
  accessKeyId: S3_ACCESS_KEY_ID,
  secretAccessKey: S3_SECRET_ACCESS_KEY,
  // Everything that is not AWS itself. Most self-hosted services also want
  // forcePathStyle, which is on by default once an endpoint is set.
  endpoint: "https://<account>.r2.cloudflarestorage.com",
}
```

| Provider | Large files | Runs on |
| -------- | ----------- | ------- |
| `gcs`    | resumable sessions | Google Cloud Storage, signing with ADC |
| `s3`     | multipart uploads  | AWS S3 and every S3-compatible service — MinIO, Cloudflare R2, Backblaze B2, Supabase Storage, Ceph |

An S3 bucket needs one lifecycle rule of its own:

```
AbortIncompleteMultipartUpload: DaysAfterInitiation: 7
```

Parts of an unfinished multipart upload are billed while staying invisible to
`ListObjects`, and the sweeper's cancel is best-effort — so this is the backstop
for bytes it could not reach. GCS needs no equivalent for resumable sessions: it
garbage-collects abandoned ones after a week on its own.

Both client SDKs are **optional peer dependencies** and each driver is imported
dynamically, so a deployment installs and loads only the backend it runs: GCS
needs `@google-cloud/storage`, S3 needs `@aws-sdk/client-s3` and
`@aws-sdk/s3-request-presigner`.

A third backend is one file: implement `FileStorage`, return whichever strategy
it speaks, and put whatever it needs to finish or cancel later into
`UploadCoords`.
