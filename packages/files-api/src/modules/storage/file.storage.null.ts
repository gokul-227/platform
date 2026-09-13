import { PlatformError } from "@aec-craft/platform-contracts";
import { FileErrors } from "../file.errors";
import type {
  DownloadTarget,
  FileStorage,
  StoredObject,
  UploadCoords,
  UploadTarget,
} from "./file.storage";

/**
 * No storage configured: folder operations keep working, byte operations
 * fail with `FILE_STORAGE_UNAVAILABLE` (503).
 */
export class NullFileStorage implements FileStorage {
  readonly available = false;

  createUpload(): Promise<{ coords: UploadCoords; target: UploadTarget }> {
    throw new PlatformError(FileErrors.STORAGE_UNAVAILABLE);
  }
  refreshUpload(): Promise<UploadTarget> {
    throw new PlatformError(FileErrors.STORAGE_UNAVAILABLE);
  }
  createDownloadTarget(): Promise<DownloadTarget> {
    throw new PlatformError(FileErrors.STORAGE_UNAVAILABLE);
  }
  finalizeUpload(): Promise<StoredObject> {
    throw new PlatformError(FileErrors.STORAGE_UNAVAILABLE);
  }
  head(): Promise<StoredObject> {
    throw new PlatformError(FileErrors.STORAGE_UNAVAILABLE);
  }
  cancelUpload(): Promise<void> {
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}
