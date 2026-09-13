/**
 * Cursor mode: an opaque keyset over `(timestamp, id)`. The token is
 * base64url-encoded JSON `{ <field>, id }`, and the timestamp's field name is
 * part of the externally-visible token, so a list ordered by a column it does
 * not call `createdAt` names its own.
 *
 * A token this package cannot decode is refused as `VALIDATION_FAILED`, the same
 * as any other unusable query input. It used to degrade to the head of the list,
 * which reads as a fresh first page: a client paging on a token it cannot decode
 * then loops over page one forever instead of being told the cursor is bad.
 */

import { failed } from "./failure";
import type { CursorListResponse } from "./list.spec";
import type { CursorPageQuery } from "./page";

export interface Cursor {
  id: string;
  /** The ordering column's value, whatever the list orders by. */
  timestamp: Date;
}

export function encodeCursor(
  timestamp: Date,
  id: string,
  field = "createdAt"
): string {
  return Buffer.from(
    JSON.stringify({ [field]: timestamp.toISOString(), id }),
    "utf8"
  ).toString("base64url");
}

export function decodeCursor(token: string, field = "createdAt"): Cursor {
  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8")
    ) as Record<string, unknown>;
  } catch {
    throw failed("Malformed cursor: pass the `nextCursor` a page returned.");
  }
  const timestamp = decoded[field];
  const id = decoded.id;
  if (typeof timestamp !== "string" || typeof id !== "string") {
    throw failed(
      `Malformed cursor: expected \`${field}\` and \`id\`. Pass the \`nextCursor\` a page returned.`
    );
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw failed("Malformed cursor: its timestamp is not a date.");
  }
  return { id, timestamp: parsed };
}

/**
 * Fetch one cursor page and assemble the envelope. `fetch(limit)` runs the
 * endpoint's query resumed at the request's cursor (`keysetWhere` builds that
 * predicate) and is asked for one row more than the page, which is how the
 * next cursor is known to exist. `keyOf` projects the last kept row to the
 * coordinates the next token carries.
 */
export async function fetchCursorPage<Row, Item>(
  query: CursorPageQuery,
  fetch: (limit: number) => Promise<Row[]>,
  toItem: (row: Row) => Item,
  keyOf: (row: Row) => [Date, string],
  field = "createdAt"
): Promise<CursorListResponse<Item>> {
  const rows = await fetch(query.limit + 1);
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const tail = page.at(-1);
  let nextCursor: string | null = null;
  if (hasMore && tail) {
    const [timestamp, id] = keyOf(tail);
    nextCursor = encodeCursor(timestamp, id, field);
  }
  return { items: page.map(toItem), nextCursor };
}
