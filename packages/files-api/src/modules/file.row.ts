import type { RowPermitSource } from "@aec-craft/platform-authorization/nest";
import { file } from "../database/schema";
import { FileErrors } from "./file.errors";

/**
 * Where a by-id route in this package finds its scope: the row's own group.
 * Passed to `@RequireRowPermit`, which reads the columns and authorizes before
 * the handler runs.
 */
export const FILE_ROW: RowPermitSource = {
  idParam: "fileId",
  notFound: FileErrors.NOT_FOUND,
  table: file,
};
