/**
 * Filter spec for `GET /users`, the operator list.
 *
 * Default sort is `createdAt:asc`. There is no role filter: a platform user row
 * is a profile, and what someone may do is a standing on a group rather than a
 * column here.
 */

import { column, defineFilters, defineListSpec } from "../query";

export const userFilters = defineFilters({
  email: column.string({
    ops: ["eq", "startsWith", "contains"],
    description:
      "Filter by primary email. Case-insensitive for startsWith / contains.",
    sortable: true,
  }),
  name: column.string({
    ops: ["eq", "startsWith", "contains"],
    description: "Filter by display name.",
    sortable: true,
  }),
  createdAt: column.date({
    ops: ["gte", "lte"],
    description: "Filter by account creation date (ISO 8601).",
    sortable: true,
  }),
  externalId: column.string({
    ops: ["eq"],
    description:
      "Filter by the identity provider's id for this person, which is what the staff console holds.",
  }),
});
/** List contract for `GET /users`, the operator list. */
export const userList = defineListSpec({
  filters: userFilters,
  pagination: { modes: ["cursor", "offset"], default: "offset" },
  defaultSort: "createdAt:asc",
});
