import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

export const FileIndexErrors = {
  NOT_CONFIGURED: {
    code: "FILE_INDEX_NOT_CONFIGURED",
    status: 503,
    name: "Document index not configured",
    description:
      "This deployment has no embedding provider or vector store configured, so documents cannot be indexed or searched.",
  },
  ANSWERER_NOT_CONFIGURED: {
    code: "FILE_INDEX_ANSWERER_NOT_CONFIGURED",
    status: 503,
    name: "Grounded answers not configured",
    description:
      "Retrieval works, but this deployment has no answer model configured, so `ask` is unavailable. Use `context` and generate the answer yourself.",
  },
  UNSUPPORTED_CONTENT_TYPE: {
    code: "FILE_INDEX_UNSUPPORTED_CONTENT_TYPE",
    status: 415,
    name: "Content type cannot be indexed",
    description:
      "No extractor in this deployment can turn this content type into text. The file is stored and downloadable; it is not searchable.",
  },
  EXTRACTION_FAILED: {
    code: "FILE_INDEX_EXTRACTION_FAILED",
    status: 502,
    name: "Text extraction failed",
    description:
      "The extraction provider could not process the document. The failure is recorded on the file's index status; resubmitting the file retries it.",
  },
  NOT_INDEXED: {
    code: "FILE_INDEX_NOT_INDEXED",
    status: 404,
    name: "File is not indexed",
    description:
      "This file has never been submitted to the document index, so it has no index state and no extracted text.",
  },
  NOT_READY: {
    code: "FILE_INDEX_NOT_READY",
    status: 409,
    name: "File not ready to index",
    description:
      "Only a `ready` file can be indexed. A pending upload has no confirmed bytes to extract.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
