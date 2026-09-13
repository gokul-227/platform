import { timestamp } from "drizzle-orm/pg-core";

/**
 * A `timestamptz(3)` column: the only precision a keyset cursor can round-trip.
 *
 * `encodeCursor` carries an ISO string taken from a JS `Date`, which holds
 * milliseconds, and node-postgres has already dropped anything finer before the
 * value reaches application code. A column keeping microseconds therefore names
 * a boundary no row can equal: an `asc` page re-serves its tail row, a `desc`
 * page skips every row sharing the tail's millisecond. Precision 3 makes the
 * database round each write to what the cursor carries, and the id tiebreak in
 * the keyset comparison orders within the millisecond.
 *
 * Every timestamp on a table a list keyset-paginates is declared here. A table
 * no cursor reaches (`graph_version`, `file_upload`, `file_index`) keeps
 * microseconds and its own `timestamp` call.
 */
export function msTimestamp(name: string) {
  return timestamp(name, { withTimezone: true, mode: "date", precision: 3 });
}
