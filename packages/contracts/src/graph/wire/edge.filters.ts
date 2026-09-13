/**
 * Filter spec for `GET /graph/edges`. Mirror of `graph.node.filters.ts`; edges
 * carry no `class` / `phase` / `parentId` (no hierarchy) but gain
 * `sourceId` + `targetId` (the endpoint columns). No `sortable` flags;
 * cursor pagination owns the order (see `graph.node.filters.ts` for the rationale).
 */

import { column, defineFilters, defineListSpec, jsonbPath } from "../../query";

export const graphEdgeFilters = defineFilters({
  type: column.string({
    sortable: true,
    ops: ["eq", "in"],
    description: "Filter by edge type (e.g. `contains`, `bounds`, `serves`).",
  }),
  sourceId: column.uuid({
    ops: ["eq", "in"],
    description: "Filter by edge source node id.",
  }),
  targetId: column.uuid({
    ops: ["eq", "in"],
    description: "Filter by edge target node id.",
  }),
  properties: jsonbPath({
    ops: ["hasKey", "eq", "gt", "gte", "lt", "lte"],
    description:
      "JSONB path filter against the `properties` column. `?properties=hasKey.weight` returns edges whose `properties` bag has the `weight` top-level key; `?properties->weight=gte.5` walks the path and compares.",
  }),
  createdAt: column.date({
    sortable: true,
    ops: ["gte", "lte"],
    description: "When the edge was created (ISO 8601).",
  }),
});

/**
 * Cursor by default, for the reason `node.filters.ts` states: a deep `OFFSET`
 * re-scans every row before the window.
 */
export const graphEdgeList = defineListSpec({
  filters: graphEdgeFilters,
  pagination: { modes: ["cursor", "offset"], default: "cursor" },
});
