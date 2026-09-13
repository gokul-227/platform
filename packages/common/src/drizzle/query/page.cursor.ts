import { decodeCursor } from "@aec-craft/platform-contracts";
import { asc, desc, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * The SQL half of cursor mode: where a token resumes, and the order it is
 * pinned to. Both read one `Keyset`, so a list cannot page in one direction
 * and order in the other, which would serve the same row on every page.
 */
export interface Keyset {
  direction: "asc" | "desc";
  /** The timestamp's name inside the token. Defaults to `createdAt`. */
  field?: string;
  /** Tiebreak within one timestamp; the keyset is not unique without it. */
  id: PgColumn;
  /**
   * Compared before the id, and carried in the token. A mutable column is
   * allowed only while it moves the same way the page walks — `updatedAt` under
   * a `desc` keyset leaves the unvisited region, so a row that changes
   * mid-scroll goes missing until the next fetch rather than arriving twice.
   */
  timestamp: PgColumn;
}

/** The predicate that resumes after `cursor`; nothing on the first page. */
export function keysetWhere(
  keyset: Keyset,
  cursor: string | null
): SQL | undefined {
  if (cursor === null) {
    return;
  }
  const bound = decodeCursor(cursor, keyset.field);
  return keyset.direction === "asc"
    ? sql`(${keyset.timestamp}, ${keyset.id}) > (${bound.timestamp}, ${bound.id})`
    : sql`(${keyset.timestamp}, ${keyset.id}) < (${bound.timestamp}, ${bound.id})`;
}

export function keysetOrder(keyset: Keyset): SQL[] {
  const direction = keyset.direction === "asc" ? asc : desc;
  return [direction(keyset.timestamp), direction(keyset.id)];
}
