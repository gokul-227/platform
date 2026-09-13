import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  CreateUploadArgs,
  DownloadTarget,
  FileStorage,
  MultipartUploadTarget,
  PutUploadTarget,
  StoredObject,
  UploadCoords,
  UploadTarget,
} from "./file.storage";

export interface S3FileStorageOptions {
  accessKeyId: string;
  bucket: string;
  /** Endpoint of the S3-compatible service. Omit for AWS itself. */
  endpoint?: string;
  /** Path-style addressing, which most self-hosted services need. */
  forcePathStyle?: boolean;
  /** At or below this size: one signed PUT. Above: a multipart upload. */
  multipartThresholdBytes: number;
  /** Bytes per part. S3 requires at least 5 MiB for every part but the last. */
  partSizeBytes: number;
  region: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** How long the part URLs stay valid; bounds how long an upload may take. */
  urlTtlSeconds: number;
}

/** What `ListParts` gives back per part; both fields are optional in the SDK's types. */
interface S3Part {
  ETag?: string | undefined;
  PartNumber?: number | undefined;
}

/** S3's floor for every part but the last. */
const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
/** S3's ceiling on parts per upload. */
const MAX_PARTS = 10_000;
/** Signed read/write URL validity for the single-request paths. */
const SIGNED_URL_TTL_SECONDS = 15 * 60;

/**
 * S3 and every S3-compatible service. A large file uses multipart: the client
 * PUTs parts to presigned URLs and the server assembles them from `ListParts`,
 * so the client keeps no ETag bookkeeping and a resumed upload is told which
 * parts are missing. Parts are the unit of retry, where GCS retries a range.
 */
export class S3FileStorage implements FileStorage {
  readonly available = true;
  private readonly client: S3Client;

  constructor(private readonly options: S3FileStorageOptions) {
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.forcePathStyle ? { forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        ...(options.sessionToken ? { sessionToken: options.sessionToken } : {}),
      },
    });
  }

  async createUpload(
    args: CreateUploadArgs
  ): Promise<{ coords: UploadCoords; target: UploadTarget }> {
    if (args.sizeBytes <= this.options.multipartThresholdBytes) {
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

    const partSizeBytes = this.partSizeFor(args.sizeBytes);
    const created = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.options.bucket,
        Key: args.key,
        ContentType: args.contentType,
      })
    );
    const uploadId = created.UploadId;
    if (!uploadId) {
      throw new Error("S3 did not return an upload id");
    }

    const partNumbers = partNumbersFor(args.sizeBytes, partSizeBytes);
    return {
      target: {
        type: "multipart",
        partSizeBytes,
        parts: await this.signParts(args.key, uploadId, partNumbers),
        expiresAt: this.expiry(this.options.urlTtlSeconds),
      },
      coords: {
        strategy: "multipart",
        sessionUrl: null,
        multipartUploadId: uploadId,
        partSizeBytes,
      },
    };
  }

  async refreshUpload(
    args: CreateUploadArgs,
    coords: UploadCoords
  ): Promise<UploadTarget> {
    if (coords.strategy !== "multipart" || !coords.multipartUploadId) {
      return await this.createPutTarget(args);
    }
    const partSizeBytes = coords.partSizeBytes ?? this.options.partSizeBytes;
    const landed = await this.listPartNumbers(
      args.key,
      coords.multipartUploadId
    );
    const missing = partNumbersFor(args.sizeBytes, partSizeBytes).filter(
      (partNumber) => !landed.has(partNumber)
    );
    return {
      type: "multipart",
      partSizeBytes,
      parts: await this.signParts(args.key, coords.multipartUploadId, missing),
      expiresAt: this.expiry(this.options.urlTtlSeconds),
    };
  }

  async finalizeUpload(
    key: string,
    coords: UploadCoords
  ): Promise<StoredObject> {
    if (coords.strategy !== "multipart" || !coords.multipartUploadId) {
      return await this.head(key);
    }
    const parts = await this.listParts(key, coords.multipartUploadId);
    if (parts.length === 0) {
      return { exists: false, size: null, checksum: null };
    }
    try {
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.options.bucket,
          Key: key,
          UploadId: coords.multipartUploadId,
          MultipartUpload: {
            Parts: parts.map((part) => ({
              PartNumber: part.PartNumber,
              ETag: part.ETag,
            })),
          },
        })
      );
    } catch (err) {
      // Idempotent: a retried complete finds the upload already assembled and
      // gone, which is a success as far as the caller is concerned.
      if (!isNoSuchUpload(err)) {
        throw err;
      }
    }
    return await this.head(key);
  }

  async cancelUpload(key: string, coords: UploadCoords): Promise<void> {
    if (coords.strategy === "multipart" && coords.multipartUploadId) {
      await this.client
        .send(
          new AbortMultipartUploadCommand({
            Bucket: this.options.bucket,
            Key: key,
            UploadId: coords.multipartUploadId,
          })
        )
        .catch(() => {
          // Already aborted or completed; the object removal below covers it.
        });
    }
    await this.remove(key);
  }

  async createDownloadTarget(
    key: string,
    fileName: string
  ): Promise<DownloadTarget> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS }
    );
    return { url, expiresAt: this.expiry(SIGNED_URL_TTL_SECONDS) };
  }

  async head(key: string): Promise<StoredObject> {
    try {
      const found = await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: key })
      );
      return {
        exists: true,
        size: found.ContentLength ?? null,
        // A multipart object's ETag is not an md5, so it is a weak checksum at
        // best; recorded as-is for change detection, never as an integrity claim.
        checksum: found.ETag?.replaceAll('"', "") ?? null,
      };
    } catch (err) {
      if (isNotFound(err)) {
        return { exists: false, size: null, checksum: null };
      }
      throw err;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }))
      .catch((err: unknown) => {
        if (!isNotFound(err)) {
          throw err;
        }
      });
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private expiry(seconds: number): Date {
    return new Date(Date.now() + seconds * 1000);
  }

  /**
   * Parts have a floor of 5 MiB and a ceiling of 10 000 per upload, so a big
   * enough file forces a bigger part than configured.
   */
  private partSizeFor(sizeBytes: number): number {
    const configured = Math.max(
      this.options.partSizeBytes,
      MIN_PART_SIZE_BYTES
    );
    return Math.max(configured, Math.ceil(sizeBytes / MAX_PARTS));
  }

  private async createPutTarget(
    args: CreateUploadArgs
  ): Promise<PutUploadTarget> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: args.key,
        ContentType: args.contentType,
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS }
    );
    return {
      type: "put",
      url,
      method: "PUT",
      headers: { "Content-Type": args.contentType },
      expiresAt: this.expiry(SIGNED_URL_TTL_SECONDS),
    };
  }

  private async signParts(
    key: string,
    uploadId: string,
    partNumbers: number[]
  ): Promise<MultipartUploadTarget["parts"]> {
    return await Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          this.client,
          new UploadPartCommand({
            Bucket: this.options.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: this.options.urlTtlSeconds }
        ),
      }))
    );
  }

  private async listParts(key: string, uploadId: string): Promise<S3Part[]> {
    const parts: S3Part[] = [];
    let marker: number | undefined;
    do {
      const page = await this.client
        .send(
          new ListPartsCommand({
            Bucket: this.options.bucket,
            Key: key,
            UploadId: uploadId,
            ...(marker === undefined ? {} : { PartNumberMarker: `${marker}` }),
          })
        )
        .catch((err: unknown) => {
          if (isNoSuchUpload(err)) {
            return null;
          }
          throw err;
        });
      if (!page) {
        return parts;
      }
      parts.push(...(page.Parts ?? []));
      marker = page.IsTruncated ? Number(page.NextPartNumberMarker) : undefined;
    } while (marker !== undefined);
    return parts.sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0));
  }

  private async listPartNumbers(
    key: string,
    uploadId: string
  ): Promise<Set<number>> {
    const parts = await this.listParts(key, uploadId);
    return new Set(
      parts
        .map((part) => part.PartNumber)
        .filter((partNumber): partNumber is number => partNumber !== undefined)
    );
  }
}

function partNumbersFor(sizeBytes: number, partSizeBytes: number): number[] {
  const count = Math.max(1, Math.ceil(sizeBytes / partSizeBytes));
  return Array.from({ length: count }, (_unused, index) => index + 1);
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string } | undefined)?.name;
  const status = (
    err as { $metadata?: { httpStatusCode?: number } } | undefined
  )?.$metadata?.httpStatusCode;
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}

function isNoSuchUpload(err: unknown): boolean {
  return (err as { name?: string } | undefined)?.name === "NoSuchUpload";
}
