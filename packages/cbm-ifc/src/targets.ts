import type { Target } from "@aec-craft/platform-cbm-engine";

type NodeTarget = Extract<Target, { as: "node" }>;

/**
 * Shorthand for the commonest target, a node of a fixed class.
 *
 * The structural type is not stated: the engine derives it from the class
 * root, so a node's type and class cannot disagree.
 */
export const node = (cls: NonNullable<NodeTarget["class"]>): Target => ({
  as: "node",
  class: cls,
});
