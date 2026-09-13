/**
 * Where a file's bytes live in the bucket, derived rather than stored: an
 * upload, a download and a delete each compute the same key from the row.
 *
 * Its own file because both the tree service and the index service need it, and
 * having the index import it from the tree service made those two modules a
 * cycle: whichever loaded second saw `undefined` where a decorator expected a
 * class, and Nest refused the injection at boot.
 */
export function storageKeyFor(
  orgId: string,
  projectId: string | null,
  id: string
): string {
  return `${orgId}/${projectId ?? "org"}/${id}`;
}
