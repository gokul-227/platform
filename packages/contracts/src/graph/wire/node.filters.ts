/**
 * Filter spec for `GET /graph/nodes`.
 *
 * Hand-rolled wire fields the framework now subsumes: `type`, `class`,
 * `phase`, `parentId`, `hasProperty` (became `properties=hasKey.<key>`).
 * Native fields the framework does NOT subsume stay on the list-input
 * schema directly: `orgId` / `projectId` (scope addressing), `scope`
 * (project-list hydration narrowing), `select` (response projection),
 * `limit` / `cursor` (pagination).
 *
 * `sortable: true` is honoured in offset mode only. Cursor mode pages over a
 * fixed `(createdAt desc, id desc)` key, and a user-supplied sort would break
 * that key's stability, so `sortExpressions` is read on the offset branch and
 * ignored on the cursor one.
 */

import { column, defineFilters, defineListSpec, jsonbPath } from "../../query";

export const graphNodeFilters = defineFilters({
  id: column.uuid({
    ops: ["eq", "in"],
    description:
      "Filter by node id. `in.(a,b,c)` resolves an id list (e.g. a chat answer's references) in one call.",
  }),
  type: column.string({
    sortable: true,
    ops: ["eq", "in"],
    description:
      "Filter by node type (`object`, `rule`, `reference`, or a custom value).",
  }),
  name: column.string({
    sortable: true,
    ops: ["eq", "startsWith", "contains"],
    description:
      "Filter by display name. `contains` is a case-insensitive substring match, e.g. `?name=contains.door` for search boxes.",
  }),
  class: column.string({
    sortable: true,
    ops: ["eq", "startsWith", "contains", "in"],
    description:
      "Filter by class string in dot-notation. `startsWith` is the cheap way to scope a class family (e.g. `?class=startsWith.space.`); `contains` supports search-box matching.",
  }),
  phase: column.string({
    ops: ["eq", "in"],
    description: "Filter by lifecycle phase.",
  }),
  parentId: column.uuid({
    ops: ["eq", "in"],
    description: "Filter by parent node id. `eq.null` returns roots.",
  }),
  properties: jsonbPath({
    ops: ["hasKey", "eq", "gt", "gte", "lt", "lte"],
    description:
      "JSONB path filter against the `properties` column. `?properties=hasKey.envelope` returns nodes whose `properties` bag has the `envelope` top-level key (cheap, GIN-backed); `?properties->envelope->netArea=gte.5` walks the path and compares.",
  }),
  createdAt: column.date({
    sortable: true,
    ops: ["gte", "lte"],
    description: "When the node was created (ISO 8601).",
  }),
});

/**
 * Cursor by default: the largest tables in the platform, and a deep `OFFSET`
 * re-scans every row before the window. Offset stays for sorted table views.
 */
export const graphNodeList = defineListSpec({
  filters: graphNodeFilters,
  pagination: { modes: ["cursor", "offset"], default: "cursor" },
});
