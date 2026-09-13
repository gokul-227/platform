/** The source type manifest. */
import { SOURCE_BLOCKS } from "./blocks";
import { SOURCE_CLASS_ROOTS } from "./class.root";
import { SOURCE_EDGES } from "./edges";

export * from "./blocks";
export { SOURCE_CLASS_ROOTS } from "./class.root";
export * from "./edges";

export const SOURCE_MANIFEST = {
  nodeType: "source",
  classRoots: SOURCE_CLASS_ROOTS,
  blocks: SOURCE_BLOCKS,
  edges: SOURCE_EDGES,
} as const;
