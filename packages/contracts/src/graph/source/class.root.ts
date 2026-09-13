/**
 * Class roots for the source type.
 *
 * `source` replaces `reference` in the canonical list, and the model spec splits
 * genre into the class, format into the anchor, and level into the citation
 * block. Rows written under the old value keep it and classify as drift.
 */
export const SOURCE_CLASS_ROOTS = [
  {
    value: "source",
    nodeType: "source",
    description: "An external reference: law, norm, datasheet, spec.",
  },
] as const;
