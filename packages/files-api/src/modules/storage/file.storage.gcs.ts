import { Storage } from "@google-cloud/storage";

import type {
  CreateUploadArgs,
  DownloadTarget,
  FileStorage,
  PutUploadTarget,
  StoredObject,
  UploadCoords,
  UploadTarget,
} from "./file.storage";

export interface GcsFileStorageOptions {
  bucket: string;
  /** Chunk size advertised to the client; a 256 KiB multiple (GCS requirement). */
  chunkSizeBytes: number;
  /** Browser origin echoed by the bucket in the session's CORS preflight. */
  origin?: string;
  /** At or below this size: one signed PUT. Above: a resumable session. */
  resumableThresholdBytes: number;
  /** How long a resumable session may sit unfinished. */
  sessionTtlSeconds: number;
}

/** Signed upload/download URL validity window. */
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/**
 * Signs with ADC, so the service account needs `roles/storage.objectAdmin` on
 * the bucket and `roles/iam.serviceAccountTokenCreator` on itself.
 *
 * A resumable session lives in GCS: the row keeps the URI and the committed
 * offset is read back from the bucket. The URI stays valid for a week whatever
 * TTL is advertised, so the sweeper's cancel is what bounds an abandoned upload.
 */
export class GcsFileStorage implements FileStorage {
  readonly available = true;
  private readonly storage = new Storage();

  constructor(private readonly options: GcsFileStorageOptions) {}

  async createUpload(
    args: CreateUploadArgs
  ): Promise<{ coords: UploadCoords; target: UploadTarget }> {
    if (args.sizeBytes <= this.options.resumableThresholdBytes) {
      return {
        target: await this.createPutTarget(args),
        coords: {
          strategy: "put",
          sessionUrl: null,
          multipartUploadId: null,
          partSizeBytes: null,
        },
      };
    }

    const [sessionUrl] = await this.file(args.key).createResumableUpload({
      ...(this.options.origin ? { origin: this.options.origin } : {}),
      metadata: { contentType: args.contentType },
    });
    return {
      target: {
        type: "resumable",
        sessionUrl,
        chunkSizeBytes: this.options.chunkSizeBytes,
        expiresAt: this.sessionExpiry(),
      },
      coords: {
        strategy: "resumable",
        sessionUrl,
        multipartUploadId: null,
        partSizeBytes: null,
      },
    };
  }

  async refreshUpload(
    args: CreateUploadArgs,
    coords: UploadCoords
  ): Promise<UploadTarget> {
    if (coords.strategy === "put" || coords.sessionUrl === null) {
      return await this.createPutTarget(args);
    }
    return {
      type: "resumable",
      sessionUrl: coords.sessionUrl,
      chunkSizeBytes: this.options.chunkSizeBytes,
      expiresAt: this.sessionExpiry(),
    };
  }

  finalizeUpload(key: string, _coords: UploadCoords): Promise<StoredObject> {
    // GCS finalizes on the client's last chunk, so there is nothing to assemble.
    return this.head(key);
  }

  async cancelUpload(key: string, coords: UploadCoords): Promise<void> {
    if (coords.strategy === "resumable" && coords.sessionUrl !== null) {
      // DELETE on the session URI drops the committed prefix (GCS answers 499).
      await fetch(coords.sessionUrl, { method: "DELETE" }).catch(() => {
        // Already cancelled or finalized; the object removal below covers it.
      });
    }
    await this.remove(key);
  }

  async createDownloadTarget(
    key: string,
    fileName: string
  ): Promise<DownloadTarget> {
    const expiresAt = this.signedUrlExpiry();
    const [url] = await this.file(key).getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
      responseDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
    });
    return { url, expiresAt };
  }

  async head(key: string): Promise<StoredObject> {
    const file = this.file(key);
    const [exists] = await file.exists();
    if (!exists) {
      return { exists: false, size: null, checksum: null };
    }
    const [metadata] = await file.getMetadata();
    const size = metadata.size == null ? null : Number(metadata.size);
    return { exists: true, size, checksum: metadata.md5Hash ?? null };
  }

  async remove(key: string): Promise<void> {
    await this.file(key).delete({ ignoreNotFound: true });
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private file(key: string) {
    return this.storage.bucket(this.options.bucket).file(key);
  }

  private signedUrlExpiry(): Date {
    return new Date(Date.now() + SIGNED_URL_TTL_MS);
  }

  private sessionExpiry(): Date {
    return new Date(Date.now() + this.options.sessionTtlSeconds * 1000);
  }

  /**
   * Signed PUT. The byte bound is pinned into the signature: the client must
   * send `x-goog-content-length-range` verbatim or the V4 check fails, so the
   * bucket rejects over-size bodies without the API seeing them.
   */
  private async createPutTarget(
    args: CreateUploadArgs
  ): Promise<PutUploadTarget> {
    const expiresAt = this.signedUrlExpiry();
    const contentLengthRange = `0,${args.sizeBytes}`;
    const [url] = await this.file(args.key).getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType: args.contentType,
      extensionHeaders: { "x-goog-content-length-range": contentLengthRange },
    });
    return {
      type: "put",
      url,
      method: "PUT",
      headers: {
        "Content-Type": args.contentType,
        "x-goog-content-length-range": contentLengthRange,
      },
      expiresAt,
    };
  }
}
