/** The rule type manifest. */
import { RULE_BLOCKS } from "./blocks";
import { RULE_CLASS_ROOTS } from "./class.root";
import { RULE_EDGES } from "./edges";

export * from "./blocks";
export { RULE_CLASS_ROOTS } from "./class.root";
export * from "./edges";

export const RULE_MANIFEST = {
  nodeType: "rule",
  classRoots: RULE_CLASS_ROOTS,
  blocks: RULE_BLOCKS,
  edges: RULE_EDGES,
} as const;
