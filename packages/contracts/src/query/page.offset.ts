/**
 * Offset mode: a numbered window plus the total behind it.
 */

import type { OffsetListResponse } from "./list.spec";
import type { OffsetPageQuery } from "./page";

/**
 * Fetch one offset page and assemble the envelope. `fetch(limit, offset)`
 * runs the endpoint's query with the given window and must project the match
 * count onto every row (`totalOver()`; `totalOf` reads it back). When a page
 * beyond the end comes back empty, the same fetch is re-run at `(1, 0)` to
 * recover the true total instead of reporting zero.
 */
export async function fetchOffsetPage<Row, Item>(
  query: OffsetPageQuery,
  fetch: (limit: number, offset: number) => Promise<Row[]>,
  toItem: (row: Row) => Item,
  totalOf: (row: Row) => number
): Promise<OffsetListResponse<Item>> {
  const rows = await fetch(query.pageSize, query.offset);
  let total = rows.length > 0 ? totalOf(rows[0] as Row) : 0;
  if (rows.length === 0 && query.page > 1) {
    const probe = await fetch(1, 0);
    total = probe.length > 0 ? totalOf(probe[0] as Row) : 0;
  }
  return {
    items: rows.map(toItem),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}
