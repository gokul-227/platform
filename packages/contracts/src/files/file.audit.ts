/**
 * Files-module audit actions, declared as a `resource → verb[]` map. The
 * aggregate at `@aec-craft/platform-contracts/audit` merges per-module maps so
 * `AuditService.record({ resource, verb })` type-checks the pair.
 *
 * Files and folders are two resources rather than one with the type in the
 * payload, because a reader filters by resource and the two are not the same
 * event: deleting a folder takes everything under it, and moving one moves the
 * subtree with it.
 *
 * A file arrives once, and that is `uploaded`. An upload is two requests, and the
 * row that appears at the first one is `pending` and may never be finished, so
 * recording it would file an arrival for something that might not exist and
 * report every finished upload twice. A folder is the other way round: creating
 * it is the whole of its existence, and it has no bytes to land.
 *
 * `moved` is separate from `updated` for the same reason: a rename changes what
 * a row is called, and a move can change which group answers for it, and so who
 * can see it at all.
 *
 * An upload that is abandoned or swept records nothing, because the row it
 * removes never arrived: `pending` is a reservation, and a reservation expiring
 * is not an event in the history of a file that exists.
 *
 * `downloaded` is the one read here, and it is a read worth the volume: on this
 * platform a model leaving the building is the event somebody asks about later,
 * and a signed url is the moment it left. It records the request for the url,
 * which is as close as a bucket-direct transfer lets the api get.
 */
export const FILE_AUDIT_ACTIONS = {
  file: ["uploaded", "downloaded", "updated", "moved", "deleted"],
  folder: ["created", "updated", "moved", "deleted"],
} as const;

export type FileAuditResource = keyof typeof FILE_AUDIT_ACTIONS;

/** Ordered list of file-scoped audit resources, derived from the action map so
 *  a new resource appears in any consumer iterating the bucket (the audit
 *  page's resource filter). */
export const FILE_AUDIT_RESOURCES: readonly FileAuditResource[] = Object.keys(
  FILE_AUDIT_ACTIONS
) as FileAuditResource[];

/** Display labels keyed by `${resource}.${verb}`, past tense. */
export const FILE_AUDIT_ACTION_LABELS = {
  "file.uploaded": "File uploaded",
  "file.downloaded": "File downloaded",
  "file.updated": "File updated",
  "file.moved": "File moved",
  "file.deleted": "File deleted",
  "folder.created": "Folder created",
  "folder.updated": "Folder updated",
  "folder.moved": "Folder moved",
  "folder.deleted": "Folder deleted",
} as const;
