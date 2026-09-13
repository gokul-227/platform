/**
 * Filter spec for `GET /projects`.
 *
 * Listing is internally narrowed to projects the principal is a member of
 * (see `ProjectService.list` `memberOf` option). These filters narrow that
 * set further. `orgId` lets a caller restrict to projects in one
 * organization without composing a path-based scoped route.
 */

import { column, defineFilters, defineListSpec } from "../../query";

export const projectFilters = defineFilters({
  id: column.uuid({
    ops: ["eq", "in"],
    column: "p.id",
    description:
      "Filter by project id. Used for bulk lookups (`?id=in.(...)`).",
  }),
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
  orgId: column.uuid({
    ops: ["eq", "in"],
    column: "p.orgId",
    description: "Restrict to projects in this organization.",
  }),
  createdAt: column.date({
    ops: ["gte", "lte"],
    column: "p.createdAt",
    description: "Filter by creation date (ISO 8601).",
    sortable: true,
  }),
  updatedAt: column.date({
    ops: ["gte", "lte"],
    column: "p.updatedAt",
    description: "Filter by last-update date (ISO 8601).",
    sortable: true,
  }),
});
/** List contract for `GET /projects` and `GET /orgs/:orgId/projects`. */
export const projectList = defineListSpec({
  filters: projectFilters,
  pagination: { modes: ["cursor", "offset"], default: "offset" },
  defaultSort: "name:asc",
});
