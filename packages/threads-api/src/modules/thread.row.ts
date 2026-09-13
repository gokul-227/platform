import type { RowPermitSource } from "@aec-craft/platform-authorization/nest";
import { thread } from "../database/schema";
import { ThreadErrors } from "./thread.errors";

/**
 * Where a by-id route in this package finds its scope: the row's own group.
 * Passed to `@RequireRowPermit`, which reads the columns and authorizes before
 * the handler runs.
 * `ownedBy` is the ownership half: the group decides whether you may use threads here at
 * all, and the subject column decides which rows are yours.
 */
export const THREAD_ROW: RowPermitSource = {
  idParam: "threadId",
  notFound: ThreadErrors.NOT_FOUND,
  ownedBy: thread.subject,
  table: thread,
};
