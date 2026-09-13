/**
 * The declaration kit: what a node type uses to declare itself. `defineBlock`
 * for a capability block, `defineEdge` for a relation, and the three structural
 * types a class root can resolve to.
 *
 * Nothing here imports from `wire/` or from a type folder, which is what keeps
 * the dependency one-way: a type folder declares against the kit, `vocabulary.ts`
 * composes the declarations, and the wire surface reads the composed lists.
 */
export { type BlockDefinition, defineBlock } from "./block";
export {
  defineEdge,
  type EdgeCardinality,
  type EdgeDefinition,
  type EdgeOrigin,
  PARENT_ID_PRODUCER,
} from "./edge";
export {
  CANONICAL_NODE_TYPES,
  type CanonicalNodeType,
  NODE_TYPES,
} from "./node.type";
