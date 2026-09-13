/**
 * Class roots for the `object` type: the first dot-segment of a node's `class`.
 *
 * `class` stays open dot-notation (`space.circulation`): the roots are
 * governed, the leaves are free. The crosswalk to BOT, IFC and LOCUS lives in
 * docs/cognitive-building-model.md, not in the code.
 */
export const OBJECT_CLASS_ROOTS = [
  { value: "site", nodeType: "object", description: "A plot or site." },
  { value: "building", nodeType: "object", description: "A building." },
  {
    value: "storey",
    nodeType: "object",
    description: "A building storey / level.",
  },
  {
    value: "space",
    nodeType: "object",
    description:
      "An enclosed space or room. Leaves are typological (`space.circulation`), never the use: that lives in `programme.use`, because a change of use must not re-classify the node.",
  },
  {
    value: "element",
    nodeType: "object",
    description:
      "A physical building element: wall, slab, door, window, column, stair.",
  },
  {
    value: "interface",
    nodeType: "object",
    description:
      "A boundary between a space and an element, or between two spaces (space boundaries as first-class nodes).",
  },
] as const;
