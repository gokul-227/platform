/**
 * Filter spec for `GET /files`. Native scope/pagination fields
 * (`orgId`/`projectId`/`scope`/`limit`/`cursor`) stay on the list-input schema;
 * everything browseable lives here. `parentId` is one of those natives: it takes
 * a bare id, and the scope root is the parameter omitted.
 */

import { column, defineFilters, defineListSpec } from "../query";

export const fileFilters = defineFilters({
  type: column.string({
    ops: ["eq"],
    sortable: true,
    description:
      "Filter by type: `file` or `folder`. Sortable, which is how a tree puts " +
      "folders first: `sort=type:desc&sort=name:asc` (the values order " +
      "lexically, so `folder` precedes `file` descending).",
  }),
  status: column.string({
    ops: ["eq", "in"],
    description: "Filter by upload status: `pending` or `ready`.",
  }),
  name: column.string({
    ops: ["eq", "startsWith", "contains"],
    sortable: true,
    description:
      "Filter by file or folder name (case-insensitive for startsWith/contains).",
  }),
  externalId: column.string({
    ops: ["eq", "in"],
    description:
      "Filter by your own identifier for the entry, as passed on create.",
  }),
  createdAt: column.date({
    ops: ["gte", "lte"],
    sortable: true,
    description: "When the file was created (ISO 8601).",
  }),
});

/**
 * List contract for `GET /files`: offset for anything ordered or counted (a
 * tree level, a table with page numbers), cursor for a feed that only ever
 * moves forward. `?sort` is offset-only, so a browser that wants folders first
 * is an offset caller. Default stays cursor so param-less callers keep the
 * original behavior.
 */
export const fileList = defineListSpec({
  filters: fileFilters,
  pagination: { modes: ["cursor", "offset"], default: "offset" },
  defaultSort: "createdAt:desc",
});
