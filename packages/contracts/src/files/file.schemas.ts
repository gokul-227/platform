import { z } from "zod";
import { scopeQueryRefinement, scopeQueryShape } from "../common/scope";
import { listInputSchema, listResponseSchema } from "../query";
import { ownerGroupSchema } from "../tenancy/groups/group.schemas";

import { fileList } from "./file.filters";
import {
  fileContentSchema,
  fileScopeFilterSchema,
  fileStatusSchema,
  fileTypeSchema,
} from "./shared";

const metadataSchema = z
  .record(z.string(), z.unknown())
  .describe(
    "Free client app data (e.g. `{ purpose: 'logo' }`). Applies to files and folders."
  );

// ── Response ────────────────────────────────────────────────────────────────
export const fileResponseSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z
      .string()
      .uuid()
      .describe("Parent organization id. Always present."),
    projectId: z
      .string()
      .uuid()
      .nullable()
      .describe(
        "Owning project id, or `null` when the file is org-scoped (shared library)."
      ),
    parentId: z
      .string()
      .uuid()
      .nullable()
      .describe(
        "Parent folder id within the same scope; `null` at the scope root."
      ),
    type: fileTypeSchema,
    name: z
      .string()
      .describe(
        "Display name (the leaf name; the tree is built from `parentId`)."
      ),
    externalId: z
      .string()
      .nullable()
      .describe(
        "Your own identifier for this entry, if you supplied one on create. Unique within the scope."
      ),
    status: fileStatusSchema,
    system: z
      .boolean()
      .describe(
        "Internal asset hidden from the browseable tree (e.g. an org logo)."
      ),
    content: fileContentSchema
      .nullable()
      .describe(
        "File descriptor for `type: 'file'`; `null` for folders. Never includes the bucket path."
      ),
    metadata: metadataSchema,
    hasChildren: z
      .boolean()
      .describe(
        "True if this folder has at least one child — lets a tree UI show an expand affordance without fetching. Always false for files."
      ),
    path: z
      .array(z.object({ id: z.string().uuid(), name: z.string() }))
      .optional()
      .describe(
        "Ancestor folders from the scope root down to the parent, so a row found outside its level can say where it lives. " +
          "Present only on a `recursive` listing; a root-level entry gets an empty array."
      ),
    createdBy: z
      .string()
      .uuid()
      .nullable()
      .describe(
        "The person who created the entry, as the platform's own `user.id`. Null when no person did, or when the account has since been deleted."
      ),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .describe("A file or folder.");
export type FileResponse = z.infer<typeof fileResponseSchema>;

// ── Upload ticket ───────────────────────────────────────────────────────────
// Transfer shapes, discriminated on `type`. Small files get one signed PUT.
// Large ones get a shape that can be interrupted and picked back up, which is
// what makes pause/resume and recovery after a dropped connection possible —
// `resumable` where the backend holds a growing prefix (GCS sessions),
// `multipart` where it accepts independent parts (S3 and its compatibles).
// The bucket is always the byte destination — no API in the path, whichever
// shape is in play.
export const putUploadTicketSchema = z
  .object({
    type: z.literal("put"),
    url: z
      .string()
      .url()
      .describe(
        "Short-lived signed URL to upload the bytes directly to storage."
      ),
    method: z
      .string()
      .describe("HTTP method to use for the upload (e.g. `PUT`)."),
    headers: z
      .record(z.string(), z.string())
      .describe(
        "Headers that must be sent with the upload request (e.g. `Content-Type`)."
      ),
    expiresAt: z
      .string()
      .datetime()
      .describe("When the signed URL stops working."),
  })
  .describe("Single-request upload. No pause/resume: one PUT, all the bytes.");

export const resumableUploadTicketSchema = z
  .object({
    type: z.literal("resumable"),
    sessionUrl: z
      .string()
      .url()
      .describe(
        "Storage-side upload session. PUT consecutive byte ranges to it; a `bytes */total` probe returns how much the bucket has committed. " +
          "Capability URL: it authorizes writes on its own, so it is only ever returned to the caller that created or re-fetched the session, never in a list."
      ),
    chunkSizeBytes: z
      .number()
      .int()
      .positive()
      .describe(
        "Size of each chunk to send. Every chunk but the last must be exactly this size."
      ),
    expiresAt: z
      .string()
      .datetime()
      .describe("When the session stops accepting bytes."),
  })
  .describe(
    "Chunked, resumable upload. Survives pause, connection loss, and page reload: re-fetch the session with `GET /files/:fileId/upload` and continue from the committed offset."
  );

export const multipartUploadTicketSchema = z
  .object({
    type: z.literal("multipart"),
    partSizeBytes: z
      .number()
      .int()
      .positive()
      .describe(
        "Bytes per part. Part `n` covers `[(n-1) * partSizeBytes, n * partSizeBytes)`, the last one short."
      ),
    parts: z
      .array(
        z.object({
          partNumber: z
            .number()
            .int()
            .positive()
            .describe("1-based index of the part in the file."),
          url: z
            .string()
            .url()
            .describe("Signed URL to PUT this part to. A write capability."),
        })
      )
      .describe(
        "The parts still to send — every part on a fresh upload, only what is missing when resuming. Order does not matter; the server assembles them on complete."
      ),
    expiresAt: z
      .string()
      .datetime()
      .describe("When the part URLs stop working."),
  })
  .describe(
    "Multipart upload. Parts are independent, so an interrupted upload resends only what is missing: re-fetch with `GET /files/:fileId/upload` and the server lists what already landed."
  );

export const uploadTicketSchema = z
  .discriminatedUnion("type", [
    putUploadTicketSchema,
    resumableUploadTicketSchema,
    multipartUploadTicketSchema,
  ])
  .describe("Everything the client needs to send the bytes to the bucket.");
export type MultipartUploadTicket = z.infer<typeof multipartUploadTicketSchema>;
export type PutUploadTicket = z.infer<typeof putUploadTicketSchema>;
export type ResumableUploadTicket = z.infer<typeof resumableUploadTicketSchema>;
export type UploadTicket = z.infer<typeof uploadTicketSchema>;

// ── Upload session (resume) ─────────────────────────────────────────────────
export const uploadSessionResponseSchema = z
  .object({
    file: fileResponseSchema,
    upload: uploadTicketSchema,
  })
  .describe(
    "The live upload session of a `pending` file. A `put` ticket comes back freshly signed; a `resumable` ticket points at the same session, so the client probes the committed offset and continues."
  );
export type UploadSessionResponse = z.infer<typeof uploadSessionResponseSchema>;

// ── Presets ─────────────────────────────────────────────────────────────────
// A preset is a named upload configuration: what it accepts, how big it may
// be, and what runs once the bytes land. Deployment-wide limits are the
// `default` preset, so there is one concept rather than a policy plus
// exceptions.
//
// Admission and dispatch share the one name deliberately. A preset already
// identifies a document type by its MIME allowlist, so making it the pipeline
// selector too means "this deployment accepts IFC" and "this deployment does
// something with IFC" cannot drift apart.
export const filePipelineStepSchema = z
  .enum(["index"])
  .describe(
    "`index` extracts the document's text and makes it searchable. Steps a deployment has not registered are refused at boot, not at upload."
  );
export type FilePipelineStep = z.infer<typeof filePipelineStepSchema>;

export const uploadPresetSchema = z
  .object({
    name: z
      .string()
      .describe("Preset name. `default` applies when a create names none."),
    maxFileSizeBytes: z
      .number()
      .int()
      .positive()
      .describe("Per-file ceiling. Larger declarations are rejected."),
    acceptedContentTypes: z
      .array(z.string())
      .nullable()
      .describe(
        "MIME allowlist; entries may be wildcards (`image/*`). `null` accepts any type."
      ),
    pipeline: z
      .array(filePipelineStepSchema)
      .describe(
        "What runs after a file uploaded under this preset turns `ready`, in order. Empty means the bytes are simply stored. " +
          "Published so a client knows whether to offer, say, search inside these documents; the tuning behind each step is deployment config."
      ),
  })
  .describe("One named upload configuration.");
export type UploadPreset = z.infer<typeof uploadPresetSchema>;

export const uploadPresetsResponseSchema = z
  .object({
    storageAvailable: z
      .boolean()
      .describe(
        "False when the deployment has no storage backend: folder operations work, byte operations answer 503."
      ),
    presets: z
      .array(uploadPresetSchema)
      .describe("Every preset this deployment offers, `default` among them."),
  })
  .describe(
    "What this deployment accepts on upload, so a client can reject a file before it starts sending bytes."
  );
export type UploadPresetsResponse = z.infer<typeof uploadPresetsResponseSchema>;

// ── Create (file or folder) ─────────────────────────────────────────────────
// One object (not a discriminated union) so it maps cleanly to a single DTO /
// OpenAPI schema. `contentType` + `size` are required when `type: 'file'`,
// enforced server-side; folders ignore them.
export const createFileInputSchema = z
  .object({
    groupId: ownerGroupSchema,
    type: fileTypeSchema,
    name: z.string().min(1).max(255).describe("Leaf name."),
    externalId: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .describe(
        "Your own identifier for this entry — an id from the system this file came from. Unique within the scope, and it makes create idempotent: " +
          "sending it again returns the same entry (with a fresh upload ticket while the upload is unfinished) instead of a second one."
      ),
    parentId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe(
        "Parent folder id (a folder visible from the scope); omit/null for the root."
      ),
    contentType: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .describe(
        "MIME type of the bytes to upload. Required when `type: 'file'`."
      ),
    size: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Declared byte size. Required when `type: 'file'`. It bounds the signature and picks the transfer shape: small files get one PUT, large ones a resumable session."
      ),
    checksum: z
      .string()
      .optional()
      .describe("Optional sha256 hex of the content, verified on complete."),
    preset: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "Named upload configuration to check this file against, from `GET /files/presets`. Omit for `default`. A name the deployment does not offer is rejected."
      ),
    system: z
      .boolean()
      .optional()
      .describe(
        "Mark as an internal asset, hidden from the browse listing. Default false."
      ),
    metadata: metadataSchema.optional(),
  })
  .describe(
    "Create a file (returns a signed upload ticket; status starts `pending`) or a folder (no upload)."
  );
export type CreateFileInput = z.infer<typeof createFileInputSchema>;

export const createFileResponseSchema = z
  .object({
    file: fileResponseSchema,
    upload: uploadTicketSchema
      .optional()
      .describe(
        "Present only when creating a file. Send the bytes as the ticket's `type` prescribes, then call complete."
      ),
  })
  .describe("The created row plus, for files, the upload ticket.");
export type CreateFileResponse = z.infer<typeof createFileResponseSchema>;

// ── Complete (confirm upload) ────────────────────────────────────────────────
export const completeFileInputSchema = z
  .object({
    size: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Actual uploaded size, if known."),
    checksum: z
      .string()
      .optional()
      .describe("sha256 hex of the uploaded bytes, if computed."),
  })
  .describe(
    "Confirm a pending upload finished. The server verifies the object exists in storage and that its size matches the declaration."
  );
export type CompleteFileInput = z.infer<typeof completeFileInputSchema>;

// ── Update (rename / move / retag) ───────────────────────────────────────────
export const updateFileInputSchema = z
  .object({
    name: z.string().min(1).max(255).optional().describe("New leaf name."),
    groupId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Move the file to another group. Requires `write` on the group it leaves and on the one it joins. On a folder this cascades to everything inside it: a folder restricted while its contents stay visible is not restricted."
      ),
    parentId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe(
        "New parent folder id, or `null` to move to the root. Cycle-checked for folders."
      ),
  })
  .describe(
    "Rename or move a file/folder. Content bytes are immutable; re-upload to replace."
  );
export type UpdateFileInput = z.infer<typeof updateFileInputSchema>;

// ── Download ─────────────────────────────────────────────────────────────────
export const downloadFileResponseSchema = z
  .object({
    url: z
      .string()
      .url()
      .describe("Short-lived signed URL to download the bytes."),
    expiresAt: z.string().datetime(),
  })
  .describe("A signed download URL for a ready file.");
export type DownloadFileResponse = z.infer<typeof downloadFileResponseSchema>;

// ── Get query ────────────────────────────────────────────────────────────────
export const getFileQuerySchema = z.object({}).describe("No options yet.");
export type GetFileQuery = z.infer<typeof getFileQuerySchema>;

// ── List ─────────────────────────────────────────────────────────────────────
export const fileListInputSchema = listInputSchema(fileList)
  .extend({
    parentId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "List the children of this folder. Omit to list the scope root (top level)."
      ),
    system: z.coerce
      .boolean()
      .optional()
      .describe(
        "List internal/system assets instead of the browseable tree. Default false."
      ),
    recursive: z.coerce
      .boolean()
      .optional()
      .describe(
        "Search every level of the scope instead of one, for a name filter: `recursive=true&name=contains.plan` finds a folder however deep it sits. " +
          "`parentId` is ignored, and each row carries `path` so it can name where it lives. Default false."
      ),
  })
  .extend({
    scope: fileScopeFilterSchema.optional(),
    ...scopeQueryShape,
  })
  .describe(
    "List files and folders one level at a time. Name exactly one of `orgId` or `projectId`. A project read " +
      "hydrates the parent org's library; `scope=project` narrows to project-only, `scope=org` to the library. " +
      "Pass `parentId` to open a folder; omit it for the root. `system=true` lists internal assets. " +
      "PostgREST-style filters on type/status/name/createdAt."
  );

/**
 * The same list, refined: exactly one scope, and `scope` only where there are
 * two layers to narrow between. The shape above stays a `ZodObject` so it keeps
 * composing.
 */
export const fileListQuerySchema = fileListInputSchema.superRefine(
  (query, ctx) => {
    scopeQueryRefinement(query, ctx);
    if (query.scope && !query.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "`scope` narrows a project read; an org read has nothing to narrow.",
        path: ["scope"],
      });
    }
  }
);

export type FileListInput = z.infer<typeof fileListInputSchema>;

/** @deprecated One schema serves both scopes. */
export const projectFileListInputSchema = fileListInputSchema;
export type ProjectFileListInput = z.infer<typeof projectFileListInputSchema>;

export const fileListResponseSchema = listResponseSchema(
  fileList,
  fileResponseSchema
).describe(
  "Paged file list response. Cursor pages carry `nextCursor`; offset pages carry `page`/`pageSize`/`total`/`totalPages`."
);
export type FileListResponse = z.infer<typeof fileListResponseSchema>;
