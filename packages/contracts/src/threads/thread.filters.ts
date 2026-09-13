/**
 * Filter spec for `GET /threads`. Native scope/pagination fields
 * (`orgId`/`projectId`/`limit`/`cursor`) stay on the list-input schema;
 * everything filterable lives here. `clientId` drives per-app list scoping.
 */

import { column, defineFilters, defineListSpec } from "../query";

export const threadFilters = defineFilters({
  clientId: column.string({
    ops: ["eq"],
    description:
      "Filter to threads owned by one OAuth client (per-app scoping).",
  }),
  title: column.string({
    sortable: true,
    ops: ["eq", "startsWith", "contains"],
    description:
      "Filter by thread title (case-insensitive for startsWith/contains).",
  }),
  createdAt: column.date({
    sortable: true,
    ops: ["gte", "lte"],
    description: "When the thread was created (ISO 8601).",
  }),
  updatedAt: column.date({
    sortable: true,
    ops: ["gte", "lte"],
    description: "When the thread was last updated (ISO 8601).",
  }),
});

/**
 * Cursor by default: the rail is a most-recent-first feed.
 *
 * The keyset is `updatedAt`, which is mutable, and that is sound here only
 * because it never decreases and the page walks downward: a thread touched
 * mid-scroll leaves the unvisited region rather than being served twice. It is
 * then absent until the list is refetched, which is where it appears first.
 */
export const threadList = defineListSpec({
  filters: threadFilters,
  pagination: { modes: ["cursor", "offset"], default: "cursor" },
});
