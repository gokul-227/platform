import { modifiesEdge } from "./modifies.edge";

export { modifiesEdge } from "./modifies.edge";

/**
 * The edges a rule owns. Rule to rule only: no edge crosses from a rule to an
 * object. A selector binding is a verdict row, and `governs` was removed rather
 * than kept for hand pinning, because an edge outside the rule changed scope
 * without bumping the version a verdict is stamped with. The pin moved into
 * `selector.nodeIds`, where the rule's own version witnesses it.
 */
export const RULE_EDGES = [modifiesEdge] as const;
