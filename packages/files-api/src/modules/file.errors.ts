import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

export const FileErrors = {
  NOT_FOUND: {
    code: "FILE_NOT_FOUND",
    status: 404,
    name: "File not found",
    description:
      "No file or folder matches the supplied id within the requested scope.",
  },
  PARENT_NOT_FOUND: {
    code: "FILE_PARENT_NOT_FOUND",
    status: 404,
    name: "Parent folder not found",
    description:
      "The supplied `parentId` does not match a folder visible from this scope.",
  },
  PARENT_NOT_FOLDER: {
    code: "FILE_PARENT_NOT_FOLDER",
    status: 409,
    name: "Parent is not a folder",
    description:
      "`parentId` must reference a folder; files cannot contain other files.",
  },
  PARENT_CROSS_SCOPE: {
    code: "FILE_PARENT_CROSS_SCOPE",
    status: 409,
    name: "Parent folder in incompatible scope",
    description:
      "A file's parent folder must be in the same or a wider scope. Project files may nest under a project folder or an org-library folder; org files only under org folders.",
  },
  PARENT_CYCLE: {
    code: "FILE_PARENT_CYCLE",
    status: 409,
    name: "Folder cycle",
    description:
      "Moving this folder under the chosen parent would create a cycle.",
  },
  NAME_CONFLICT: {
    code: "FILE_NAME_CONFLICT",
    status: 409,
    name: "Name already exists",
    description:
      "A file or folder with this name already exists in the same folder and scope.",
  },
  EXTERNAL_ID_CONFLICT: {
    code: "FILE_EXTERNAL_ID_CONFLICT",
    status: 409,
    name: "External id already used",
    description:
      "Another entry in this scope already carries this `externalId` and it is not the same type of entry, so the create cannot be treated as a retry of it.",
  },
  NOT_A_FILE: {
    code: "FILE_NOT_A_FILE",
    status: 409,
    name: "Not a file",
    description:
      "This operation (upload, download, complete) applies to files, not folders.",
  },
  NOT_PENDING: {
    code: "FILE_NOT_PENDING",
    status: 409,
    name: "File not pending",
    description:
      "Only a `pending` file awaiting its first upload can be completed.",
  },
  NOT_READY: {
    code: "FILE_NOT_READY",
    status: 409,
    name: "File not ready",
    description:
      "The upload has not been confirmed yet, so the file cannot be downloaded.",
  },
  UPLOAD_NOT_FOUND: {
    code: "FILE_UPLOAD_NOT_FOUND",
    status: 422,
    name: "Uploaded object missing",
    description:
      "No object was found in storage for this file; the upload did not complete.",
  },
  UPLOAD_SESSION_NOT_FOUND: {
    code: "FILE_UPLOAD_SESSION_NOT_FOUND",
    status: 404,
    name: "No upload session",
    description:
      "This file has no upload session to resume: it was never started, it already completed, or the session was swept after expiry.",
  },
  UPLOAD_EXPIRED: {
    code: "FILE_UPLOAD_EXPIRED",
    status: 410,
    name: "Upload session expired",
    description:
      "The upload session ran out of time before the bytes were confirmed. Create the file again to get a fresh one.",
  },
  UPLOAD_SIZE_MISMATCH: {
    code: "FILE_UPLOAD_SIZE_MISMATCH",
    status: 409,
    name: "Uploaded size does not match",
    description:
      "The object in storage is a different size than the client declared on create. The upload is rejected and the object removed.",
  },
  PRESET_NOT_FOUND: {
    code: "FILE_PRESET_NOT_FOUND",
    status: 400,
    name: "Upload preset not found",
    description:
      "The named `preset` is not one this deployment offers. `GET /files/presets` lists them. Named but unknown is rejected rather than silently given the `default` limits.",
  },
  CONTENT_TYPE_NOT_ALLOWED: {
    code: "FILE_CONTENT_TYPE_NOT_ALLOWED",
    status: 415,
    name: "Content type not allowed",
    description:
      "The preset this create names does not accept the declared content type.",
  },
  STORAGE_UNAVAILABLE: {
    code: "FILE_STORAGE_UNAVAILABLE",
    status: 503,
    name: "File storage not configured",
    description: "This deployment has no file storage backend configured.",
  },
  TOO_LARGE: {
    code: "FILE_TOO_LARGE",
    status: 413,
    name: "File too large",
    description:
      "The declared file size exceeds the per-file ceiling of the preset this create names.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
