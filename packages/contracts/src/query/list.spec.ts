/**
 * Per-endpoint list specification: filters + pagination contract in one
 * declaration. Extends `defineFilters` with the pagination mode allowlist so
 * the wire schema, the OpenAPI docs, and the server-side applier all read the
 * same source of truth.
 *
 *   export const orgMemberList = defineListSpec({
 *     filters: orgMemberFilters,
 *     pagination: { modes: ["offset"], default: "offset" },
 *     defaultSort: "joinedAt:asc",
 *   });
 *
 * Two modes:
 *
 *   - `cursor` — opaque keyset token (`?limit=&cursor=`), stable under
 *     concurrent writes, no total. The natural fit for feeds and chat.
 *     Cursor pages pin the sort to the keyset order; `?sort` is rejected.
 *   - `offset` — numbered pages (`?page=&pageSize=`) with `total` /
 *     `totalPages` from a window count. The natural fit for tables.
 *     `?sort` is allowed on the spec's `sortable: true` fields.
 *
 * An endpoint allowing both modes picks per request from the params present;
 * a request mixing both families is rejected. With no pagination params the
 * spec's `default` mode applies.
 */

import { z } from "zod";

import { filtersToSchema, sortSchema } from "./filter.schema";
import { type FilterSpec, sortableFields } from "./filter.spec";

export type PaginationMode = "cursor" | "offset";

export interface ListPagination {
  /** Mode the endpoint serves when no pagination params are sent. */
  default: PaginationMode;
  /** Modes this endpoint accepts. */
  modes: readonly PaginationMode[];
}

export interface ListSpec<F extends FilterSpec = FilterSpec> {
  /**
   * Server-side sort applied when the request carries no `?sort`, as
   * `field:asc|desc` over a spec field. Documentation + applier hint; cursor
   * mode always uses the keyset order instead.
   */
  defaultSort?: string;
  filters: F;
  pagination: ListPagination;
}

/** Declare a list endpoint's spec. Validates the mode allowlist at definition. */
export function defineListSpec<const S extends ListSpec>(spec: S): S {
  if (!spec.pagination.modes.includes(spec.pagination.default)) {
    throw new Error(
      `defineListSpec: default mode '${spec.pagination.default}' is not in modes [${spec.pagination.modes.join(", ")}]`
    );
  }
  return spec;
}

// ── Wire schemas ─────────────────────────────────────────────────────────────

const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(200)
  .optional()
  .describe("Cursor mode: page size. Default 50.");

const cursorSchema = z
  .string()
  .optional()
  .describe("Cursor mode: opaque cursor returned by the previous page.");

const pageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .optional()
  .describe("Offset mode: 1-based page number. Default 1.");

const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(200)
  .optional()
  .describe("Offset mode: rows per page. Default 50.");

type ModeOf<S extends ListSpec> = S["pagination"]["modes"][number];

type SortParam = z.ZodOptional<z.ZodType<string[] | undefined>>;

type ListInputShape<S extends ListSpec> = ("cursor" extends ModeOf<S>
  ? { cursor: typeof cursorSchema; limit: typeof limitSchema }
  : Record<never, never>) &
  ("offset" extends ModeOf<S>
    ? {
        page: typeof pageSchema;
        pageSize: typeof pageSizeSchema;
        sort: SortParam;
      }
    : Record<never, never>) & {
    [K in keyof S["filters"]]: z.ZodOptional<z.ZodString>;
  };

/**
 * Build the list-input zod schema for a spec: the pagination params of every
 * allowed mode, `?sort` when offset mode is allowed and the spec declares
 * sortable fields, and one string param per filter field. (A spec without
 * sortable fields types `sort` but omits it at runtime; zod strips it.)
 */
export function listInputSchema<S extends ListSpec>(
  spec: S
): z.ZodObject<ListInputShape<S>> {
  const shape: z.ZodRawShape = {};
  if (spec.pagination.modes.includes("cursor")) {
    shape.limit = limitSchema;
    shape.cursor = cursorSchema;
  }
  if (spec.pagination.modes.includes("offset")) {
    shape.page = pageSchema;
    shape.pageSize = pageSizeSchema;
    if (sortableFields(spec.filters).length > 0) {
      shape.sort = sortSchema(spec.filters).optional();
    }
  }
  Object.assign(shape, filtersToSchema(spec.filters).shape);
  return z.object(shape) as unknown as z.ZodObject<ListInputShape<S>>;
}

/** Page meta for offset mode. */
export const offsetPageMetaSchema = z.object({
  page: z.number().int().min(1).describe("The 1-based page served."),
  pageSize: z.number().int().min(1).describe("Rows per page used."),
  total: z.number().int().min(0).describe("Total rows matching the query."),
  totalPages: z
    .number()
    .int()
    .min(0)
    .describe("Total pages at this page size."),
});

export type OffsetPageMeta = z.infer<typeof offsetPageMetaSchema>;

/** The cursor-mode list envelope. */
export interface CursorListResponse<Item> {
  items: Item[];
  nextCursor: string | null;
}

/** The offset-mode list envelope. */
export interface OffsetListResponse<Item> extends OffsetPageMeta {
  items: Item[];
}

type OffsetMetaShape = typeof offsetPageMetaSchema.shape;

type ListResponseShape<
  S extends ListSpec,
  Item extends z.ZodTypeAny,
> = ("cursor" extends ModeOf<S>
  ? "offset" extends ModeOf<S>
    ? { nextCursor: z.ZodOptional<z.ZodNullable<z.ZodString>> }
    : { nextCursor: z.ZodNullable<z.ZodString> }
  : Record<never, never>) &
  ("offset" extends ModeOf<S>
    ? "cursor" extends ModeOf<S>
      ? { [K in keyof OffsetMetaShape]: z.ZodOptional<OffsetMetaShape[K]> }
      : OffsetMetaShape
    : Record<never, never>) & { items: z.ZodArray<Item> };

/**
 * Build the list-response envelope for a spec: `items` plus the page meta of
 * the allowed modes. On a dual-mode endpoint the meta fields of the mode that
 * served the request are present and the other mode's are absent, so both
 * metas go optional; single-mode endpoints keep their meta required.
 */
export function listResponseSchema<
  S extends ListSpec,
  Item extends z.ZodTypeAny,
>(spec: S, itemSchema: Item): z.ZodObject<ListResponseShape<S, Item>> {
  const dual = spec.pagination.modes.length > 1;
  const shape: z.ZodRawShape = { items: z.array(itemSchema) };
  if (spec.pagination.modes.includes("cursor")) {
    const nextCursor = z
      .string()
      .nullable()
      .describe("Cursor for the next page, or `null` when exhausted.");
    shape.nextCursor = dual ? nextCursor.optional() : nextCursor;
  }
  if (spec.pagination.modes.includes("offset")) {
    const meta = dual ? offsetPageMetaSchema.partial() : offsetPageMetaSchema;
    Object.assign(shape, meta.shape);
  }
  return z.object(shape) as unknown as z.ZodObject<ListResponseShape<S, Item>>;
}
