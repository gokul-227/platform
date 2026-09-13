/**
 * Filter spec for `GET /threads/:threadId/runs`. The thread is a path param;
 * only run-level fields are filterable here.
 */

import { column, defineFilters, defineListSpec } from "../../query";

export const threadRunFilters = defineFilters({
  status: column.string({
    sortable: true,
    ops: ["eq", "in"],
    description: "Filter by run status (e.g. `queued`, `complete`, `failed`).",
  }),
  createdAt: column.date({
    sortable: true,
    ops: ["gte", "lte"],
    description: "When the run was created (ISO 8601).",
  }),
});

/** Cursor by default: runs append under a thread while it is being read. */
export const threadRunList = defineListSpec({
  filters: threadRunFilters,
  pagination: { modes: ["cursor", "offset"], default: "cursor" },
});
