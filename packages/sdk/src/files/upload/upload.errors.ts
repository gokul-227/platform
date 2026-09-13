import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

/**
 * Failures of the byte transfer itself — the leg between the client and the
 * bucket, which no API response ever describes. They live here rather than in
 * the client that raises them so the platform has one error vocabulary: a
 * caller switches over `FileErrors` and these together, from one import.
 *
 * The statuses are for symmetry with the rest of the catalogs; nothing serves
 * these over HTTP.
 */
export const UploadErrors = {
  ABORTED: {
    code: "UPLOAD_ABORTED",
    status: 499,
    name: "Upload aborted",
    description: "The upload was cancelled by the caller.",
  },
  NETWORK_FAILED: {
    code: "UPLOAD_NETWORK_FAILED",
    status: 503,
    name: "Upload network failure",
    description:
      "The connection to storage failed and could not be recovered. A resumable upload can be continued later from the committed offset.",
  },
  STORAGE_REJECTED: {
    code: "UPLOAD_STORAGE_REJECTED",
    status: 502,
    name: "Storage rejected the upload",
    description:
      "Storage refused the bytes for a reason retrying will not fix — an expired capability, a denied signature, or a body over the provider's own limit.",
  },
  RETRIES_EXHAUSTED: {
    code: "UPLOAD_RETRIES_EXHAUSTED",
    status: 503,
    name: "Upload gave up retrying",
    description:
      "Storage kept answering with transient errors while the connection was up. The message carries the last one.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
