/**
 * Filter spec for `GET /orgs`.
 *
 * The list endpoint stays scoped to memberships you belong to (internal,
 * non-overridable); these filters narrow that set further. Sort defaults to
 * `name:asc` server-side when no `sort` is supplied — matches the
 * pre-framework behaviour.
 */

import { column, defineFilters, defineListSpec } from "../../query";

export const orgFilters = defineFilters({
  name: column.string({
    ops: ["eq", "startsWith", "contains"],
    description: "Filter by display name.",
    sortable: true,
  }),
  slug: column.string({
    ops: ["eq", "startsWith"],
    description: "Filter by URL slug.",
    sortable: true,
  }),
  createdAt: column.date({
    ops: ["gte", "lte"],
    description: "Filter by creation date (ISO 8601).",
    sortable: true,
  }),
});

/**
 * List contract for `GET /orgs`. The directory lists are table surfaces, so
 * offset is the default (page numbers + totals); cursor stays available for
 * clients that want iteration stable under concurrent writes.
 */
export const orgList = defineListSpec({
  filters: orgFilters,
  pagination: { modes: ["cursor", "offset"], default: "offset" },
  defaultSort: "name:asc",
});
