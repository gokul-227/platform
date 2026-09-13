/**
 * Which pagination mode a request gets. `page.cursor.ts` and `page.offset.ts`
 * serve the two; this file settles which one a request asked for and refuses
 * the combinations no list can answer.
 */

import { PlatformError, ValidationErrors } from "../errors";
import type { ListPagination } from "./list.spec";

const DEFAULT_PAGE_SIZE = 50;

export interface CursorPageQuery {
  cursor: string | null;
  limit: number;
  mode: "cursor";
}

export interface OffsetPageQuery {
  mode: "offset";
  /** SQL offset derived from `page` / `pageSize`. */
  offset: number;
  page: number;
  pageSize: number;
}

export type ResolvedPageQuery = CursorPageQuery | OffsetPageQuery;

interface PageQueryInput {
  cursor?: string | undefined;
  limit?: number | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  sort?: unknown;
}

/**
 * Resolve a request's pagination params against the endpoint's allowlist.
 * Mixing the two param families, requesting a mode the endpoint does not
 * allow, or sorting a cursor page all reject with `VALIDATION_FAILED`; a
 * request with neither family gets the spec's default mode.
 */
export function resolvePageQuery(
  pagination: ListPagination,
  query: PageQueryInput
): ResolvedPageQuery {
  const wantsCursor = query.limit !== undefined || query.cursor !== undefined;
  const wantsOffset = query.page !== undefined || query.pageSize !== undefined;

  if (wantsCursor && wantsOffset) {
    throw new PlatformError(
      ValidationErrors.FAILED,
      "Mixing cursor (`limit`/`cursor`) and offset (`page`/`pageSize`) pagination params is not allowed."
    );
  }
  const mode = wantsCursor
    ? "cursor"
    : wantsOffset
      ? "offset"
      : pagination.default;
  if (!pagination.modes.includes(mode)) {
    throw new PlatformError(
      ValidationErrors.FAILED,
      `This endpoint does not support ${mode} pagination.`
    );
  }
  if (mode === "cursor" && query.sort !== undefined) {
    throw new PlatformError(
      ValidationErrors.FAILED,
      "`sort` requires offset pagination; cursor pages are pinned to the keyset order."
    );
  }

  if (mode === "cursor") {
    return {
      mode,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: query.cursor ?? null,
    };
  }
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return { mode, page, pageSize, offset: (page - 1) * pageSize };
}
