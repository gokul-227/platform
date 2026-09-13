import { defineEdge } from "../../registry/edge";

/**
 * Directed, and written as two arcs for an ordinary two-way passage.
 *
 * Passability is not always mutual: panic hardware, turnstiles and security doors
 * are traversable one way. Direction is the only mechanism a path algorithm
 * respects natively, and it has to be: Memgraph's `*wShortest` has no
 * relationship filter, which is why impassability already needs a prohibitive
 * weight instead of a predicate (see `graph.dialect.ts`). A weight lambda receives
 * the edge, not the direction of travel, so one-way passability cannot be encoded
 * as a property at all. A directed expansion gets it for free.
 *
 * Cost of the choice: two rows per doorway instead of one, and no write
 * canonicalisation. Reachability that should ignore direction uses `-[:X]-`.
 */
export const connectsToEdge = defineEdge({
  value: "connectsTo",
  description:
    "Passable connection from one space to another: a door, a virtual boundary (open plan), or an unfilled opening. Two arcs for a two-way passage, one for a one-way. Derived; what reachability and egress walk.",
  from: ["space"],
  to: ["space"],
  cardinality: "manyToMany",
  symmetric: false,
  transitive: false,
  origin: { type: "derived", producer: "adapter.topology.portal" },
});
