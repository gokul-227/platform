import { Module } from "@nestjs/common";

import { type Config, ConfigToken } from "../config/config";
import { FilePipelineSettler } from "./file.pipeline.settler";
import { type FileStorage, FileStorageToken } from "./storage/file.storage";
import { NullFileStorage } from "./storage/file.storage.null";

/**
 * The storage backend and the by-id guard, here rather than in `FileModule` so
 * the index submodule can share them without a cycle: a completed upload
 * dispatches its preset's pipeline, which points the other way. Declaring the
 * provider twice would also build two clients and two GCS token caches.
 *
 * The backend is chosen at boot, and each driver is imported dynamically, so a
 * deployment loads only its own SDK. That is why those SDKs are optional peers.
 */
@Module({
  providers: [
    FilePipelineSettler,
    {
      provide: FileStorageToken,
      inject: [ConfigToken],
      useFactory: (config: Config): Promise<FileStorage> =>
        createFileStorage(config),
    },
  ],
  exports: [FilePipelineSettler, FileStorageToken],
})
export class FileCommonModule {}

async function createFileStorage(config: Config): Promise<FileStorage> {
  const storage = config.fileStorage;
  if (!storage) {
    return new NullFileStorage();
  }

  if (storage.provider === "s3") {
    const { S3FileStorage } = await import("./storage/file.storage.s3");
    return new S3FileStorage({
      bucket: storage.bucket,
      region: storage.region,
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
      forcePathStyle: storage.forcePathStyle,
      multipartThresholdBytes: storage.resumableThresholdBytes,
      partSizeBytes: storage.partSizeBytes,
      urlTtlSeconds: storage.sessionTtlSeconds,
      ...(storage.endpoint ? { endpoint: storage.endpoint } : {}),
      ...(storage.sessionToken ? { sessionToken: storage.sessionToken } : {}),
    });
  }

  const { GcsFileStorage } = await import("./storage/file.storage.gcs");
  return new GcsFileStorage({
    bucket: storage.bucket,
    chunkSizeBytes: storage.chunkSizeBytes,
    resumableThresholdBytes: storage.resumableThresholdBytes,
    sessionTtlSeconds: storage.sessionTtlSeconds,
    ...(storage.origin ? { origin: storage.origin } : {}),
  });
}
