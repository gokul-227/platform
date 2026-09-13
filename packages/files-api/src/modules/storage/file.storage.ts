/**
 * The API never carries bytes: it hands out capabilities and the client talks to
 * the bucket. The transfer shape is the backend's choice, made from the declared
 * size: one signed PUT when small, and otherwise whichever interruptible shape
 * it speaks, a resumable session or independent parts.
 */

export type UploadStrategy = "put" | "resumable" | "multipart";

export interface PutUploadTarget {
  expiresAt: Date;
  headers: Record<string, string>;
  method: string;
  type: "put";
  url: string;
}

export interface ResumableUploadTarget {
  chunkSizeBytes: number;
  expiresAt: Date;
  sessionUrl: string;
  type: "resumable";
}

export interface MultipartUploadTarget {
  expiresAt: Date;
  partSizeBytes: number;
  /** The parts still to send: all of them at first, the missing ones on resume. */
  parts: { partNumber: number; url: string }[];
  type: "multipart";
}

export type UploadTarget =
  | PutUploadTarget
  | ResumableUploadTarget
  | MultipartUploadTarget;

/**
 * Backends differ in what finishing an upload needs, so every field is nullable
 * and only the driver that wrote one reads it. `sessionUrl` authorizes writes on
 * its own, so it leaves the row only for the caller resuming its own upload.
 */
export interface UploadCoords {
  multipartUploadId: string | null;
  partSizeBytes: number | null;
  sessionUrl: string | null;
  strategy: UploadStrategy;
}

export interface CreateUploadArgs {
  contentType: string;
  key: string;
  /** Declared byte size: bounds the signature and picks the strategy. */
  sizeBytes: number;
}

export interface DownloadTarget {
  expiresAt: Date;
  url: string;
}

export interface StoredObject {
  checksum: string | null;
  exists: boolean;
  size: number | null;
}

export interface FileStorage {
  /** Is a real backend configured? Folder ops work regardless; byte ops need this. */
  readonly available: boolean;
  /** Best-effort cancel of an unfinished upload; must not throw if it is already gone. */
  cancelUpload(key: string, coords: UploadCoords): Promise<void>;
  /** Signed URL the client uses to GET the bytes directly from the bucket. */
  createDownloadTarget(key: string, fileName: string): Promise<DownloadTarget>;
  /**
   * Prepare an upload: a signed PUT for small files, and for large ones the
   * interruptible shape this backend speaks. Returns what the client needs plus
   * what the row must keep.
   */
  createUpload(
    args: CreateUploadArgs
  ): Promise<{ coords: UploadCoords; target: UploadTarget }>;
  /**
   * A `put` or a resumable session is already an object, so this is a head;
   * multipart has to be assembled first. Returns a missing object rather than
   * throwing, because a client can call complete before the last bytes land.
   */
  finalizeUpload(key: string, coords: UploadCoords): Promise<StoredObject>;
  /** Confirm an object landed. */
  head(key: string): Promise<StoredObject>;
  /**
   * A `put` gets a freshly signed URL, a resumable session comes back as-is
   * because the bucket still holds its prefix, and multipart comes back holding
   * only the parts that have not landed.
   */
  refreshUpload(
    args: CreateUploadArgs,
    coords: UploadCoords
  ): Promise<UploadTarget>;
  /** Best-effort delete; must not throw if the object is already gone. */
  remove(key: string): Promise<void>;
}

/** Nest DI token. */
export const FileStorageToken = Symbol.for(
  "@aec-craft/platform-files-api:file-storage"
);
