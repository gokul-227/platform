/**
 * Files-domain tools. Composed into the package's root `ALL_TOOLS` list.
 *
 * Mirrors `packages/files-api/src/modules/files/`, minus the byte protocol:
 * `create` (for a file), `complete`, `abort` and the upload-session route all
 * exist to move bytes to a bucket over a signed URL, which a JSON transport
 * cannot do. What is left is the tree (browse, read, rename, move, create a
 * folder) plus a signed URL to read a file's bytes with.
 *
 * The document index contributes its read side for the same reason and none of
 * its write side: submitting a document for indexing is a consequence of an
 * upload, decided by the preset the file arrived under, so no caller has a
 * decision to make there. Re-submitting and de-indexing exist as endpoints for
 * a staff member recovering a failed ingestion, which is not agent work either.
 * What an agent wants is `search` (where is this mentioned), `context` (the
 * passages, cited, ready to reason over) and `ask` (someone else writes the
 * prose).
 *
 * One tool per operation, with the scope as a parameter, the same shape the REST
 * routes take; everything keyed by a file id stays flat.
 */

import type { ToolDescriptor } from "../common/descriptor";
import { filesAskTool } from "./ask";
import { filesContextTool } from "./context";
import { filesFoldersCreateTool } from "./create-folder";
import { filesDownloadTool } from "./download";
import { filesGetTool } from "./get";
import { filesListTool } from "./list";
import { fileMetadataTools } from "./metadata";
import { filesSearchTool } from "./search";
import { filesUpdateTool } from "./update";

export * from "./ask";
export * from "./context";
export * from "./create-folder";
export { filesDownloadTool } from "./download";
export { filesGetTool } from "./get";
export * from "./list";
export * from "./metadata";
export * from "./search";
export { filesUpdateTool } from "./update";

export const fileTools: readonly ToolDescriptor[] = [
  filesListTool,
  filesFoldersCreateTool,
  filesSearchTool,
  filesContextTool,
  filesAskTool,
  filesGetTool,
  filesDownloadTool,
  filesUpdateTool,
  ...fileMetadataTools,
];
