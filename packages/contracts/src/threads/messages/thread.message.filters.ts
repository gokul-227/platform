/**
 * Filter spec for `GET /threads/:threadId/messages`. The thread is a path
 * param; only message-level fields are filterable here.
 */

import { column, defineFilters, defineListSpec } from "../../query";

export const threadMessageFilters = defineFilters({
  role: column.string({
    ops: ["eq", "in"],
    description:
      "Filter by author role: `user`, `assistant`, `system`, `tool`.",
  }),
  createdAt: column.date({
    sortable: true,
    ops: ["gte", "lte"],
    description: "When the message was created (ISO 8601).",
  }),
});

/** Cursor by default: an append-only transcript, read in keyset order. */
export const threadMessageList = defineListSpec({
  filters: threadMessageFilters,
  pagination: { modes: ["cursor", "offset"], default: "cursor" },
});
