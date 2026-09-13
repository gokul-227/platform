import type {
  CompleteFileInput,
  CreateFileInput,
  CreateFileResponse,
  DownloadFileResponse,
  FileListResponse,
  FileResponse,
  FileScope,
  ProjectFileListInput,
  UpdateFileInput,
  UploadPresetsResponse,
  UploadSessionResponse,
} from "@aec-craft/platform-contracts";

import type { Http } from "../common/http";
import { ScopedMetadataClient } from "../common/metadata.client";
import { qs } from "../common/qs";
import { scopeQuery } from "../common/scope";

import { FileIndexClient } from "./file.index.client";
import {
  type FileUpload,
  resumeFileUpload,
  startFileUpload,
  type UploadEvents,
  type UploadMeta,
} from "./upload/upload.engine";

/**
 * Files and folders. One collection, addressed by scope
 * (`/files?orgId=`, `/files?projectId=`); everything addressed by a file id
 * stays on the flat `/files/:fileId` family, where the scope is read off the
 * row.
 *
 * Bytes never go through the API. `upload` runs the whole transfer for you —
 * create the row, send the bytes to the bucket (chunked and resumable once the
 * file is large enough), confirm — and hands back controls to pause, resume, or
 * give up. `uploadFile` is the same thing awaited to completion.
 *
 *   client.files.list({ type: "project", projectId }, { parentId: folderId })
 *   client.files.createFolder({ type: "org", orgId }, { name: "Standards" })
 *   const upload = client.files.upload({ type: "project", projectId }, file);
 *   upload.pause();
 *   const ready = await upload.done;
 *
 * `client.files.index.*` is the document index over the same files: searching
 * what they say rather than browsing what they are.
 */
export class FileClient {
  /** Metadata KV: `client.files.metadata.set(fileId, keyPath, value)`. */
  readonly metadata: ScopedMetadataClient<FileResponse>;

  /** Searching the text of these files. See `FileIndexClient`. */
  readonly index: FileIndexClient;

  constructor(private readonly http: Http) {
    this.metadata = new ScopedMetadataClient<FileResponse>(http, "files");
    this.index = new FileIndexClient(http);
  }

  /** `query.scope` narrows a project list; naming an org read with it is refused. */
  list = (
    scope: FileScope,
    query?: ProjectFileListInput
  ): Promise<FileListResponse> =>
    this.http.get<FileListResponse>(
      `/files${qs({ ...scopeQuery(scope), ...query })}`
    );

  findById = (fileId: string): Promise<FileResponse> =>
    this.http.get<FileResponse>(`/files/${encodeURIComponent(fileId)}`);

  create = (
    scope: FileScope,
    input: CreateFileInput
  ): Promise<CreateFileResponse> =>
    this.http.post<CreateFileResponse>(`/files${qs(scopeQuery(scope))}`, input);

  createFolder = (
    scope: FileScope,
    input: { name: string; parentId?: string | null }
  ): Promise<FileResponse> =>
    this.create(scope, { type: "folder", ...input } as CreateFileInput).then(
      (r) => r.file
    );

  complete = (
    fileId: string,
    input: CompleteFileInput = {}
  ): Promise<FileResponse> =>
    this.http.post<FileResponse>(
      `/files/${encodeURIComponent(fileId)}/complete`,
      input
    );

  update = (fileId: string, input: UpdateFileInput): Promise<FileResponse> =>
    this.http.patch<FileResponse>(
      `/files/${encodeURIComponent(fileId)}`,
      input
    );

  delete = (fileId: string): Promise<void> =>
    this.http.delete<void>(`/files/${encodeURIComponent(fileId)}`);

  download = (fileId: string): Promise<DownloadFileResponse> =>
    this.http.get<DownloadFileResponse>(
      `/files/${encodeURIComponent(fileId)}/download`
    );

  /** What this deployment accepts, so a file can be rejected before it is sent. */
  presets = (): Promise<UploadPresetsResponse> =>
    this.http.get<UploadPresetsResponse>("/files/presets");

  /** The live upload session of a pending file — the low-level side of resuming. */
  uploadSession = (fileId: string): Promise<UploadSessionResponse> =>
    this.http.get<UploadSessionResponse>(
      `/files/${encodeURIComponent(fileId)}/upload`
    );

  /** Abandon a pending upload: cancels the session and drops the row. */
  abortUpload = (fileId: string): Promise<void> =>
    this.http.post<void>(`/files/${encodeURIComponent(fileId)}/abort`, {});

  /**
   * Upload a file and get controls back immediately. The transfer runs in the
   * background: `done` resolves with the `ready` file, or rejects with a
   * `PlatformError` (`UPLOAD_ABORTED` when you called `abort`).
   *
   * `meta.name` and `meta.contentType` default to the `File`'s own. A format the
   * browser cannot name is declared generic, and the server reads its extension.
   */
  upload = (
    scope: FileScope,
    body: Blob,
    meta?: Partial<UploadMeta>,
    events?: UploadEvents
  ): FileUpload =>
    startFileUpload({
      api: this,
      scope,
      body,
      meta: resolveMeta(body, meta),
      ...(events ? { events } : {}),
    });

  /**
   * Continue an upload that was interrupted — a pause the page did not survive,
   * a lost connection, a different device. Re-supply the same bytes; the bucket
   * decides which of them still need sending.
   */
  resumeUpload = (
    fileId: string,
    body: Blob,
    meta?: Partial<UploadMeta>,
    events?: UploadEvents
  ): FileUpload =>
    resumeFileUpload({
      api: this,
      fileId,
      body,
      meta: resolveMeta(body, meta),
      ...(events ? { events } : {}),
    });

  /**
   * Full upload, awaited: create the row, send the bytes, confirm, return the
   * `ready` file. `onProgress` receives a 0..1 fraction.
   */
  uploadFile = async (
    scope: FileScope,
    body: Blob | ArrayBuffer | Uint8Array,
    meta: UploadMeta,
    options?: { onProgress?: (fraction: number) => void; signal?: AbortSignal }
  ): Promise<FileResponse> => {
    const blob = toBlob(body, meta.contentType);
    const upload = this.upload(
      scope,
      blob,
      meta,
      options?.onProgress
        ? { onProgress: ({ progress }) => options.onProgress?.(progress) }
        : {}
    );
    if (options?.signal) {
      options.signal.addEventListener("abort", () => void upload.abort(), {
        once: true,
      });
    }
    return await upload.done;
  };
}

function resolveMeta(body: Blob, meta?: Partial<UploadMeta>): UploadMeta {
  const named = body as Blob & { name?: string };
  const name = meta?.name ?? named.name ?? "upload";
  return {
    ...meta,
    name,
    // `||`, not `??`: a browser reports the empty *string* for an extension it
    // does not know, which is every AEC exchange format. `""` declares a type of
    // no length and is refused; the generic type is how "could not name it" is
    // said, and the server maps the extension from there.
    contentType: meta?.contentType || body.type || "application/octet-stream",
  };
}

function toBlob(
  body: Blob | ArrayBuffer | Uint8Array,
  contentType: string
): Blob {
  if (body instanceof Blob) {
    return body;
  }
  return new Blob([body as BlobPart], { type: contentType });
}
