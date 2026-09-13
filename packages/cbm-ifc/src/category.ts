import { IFC_MAP } from "./profile";

/**
 * Cases the mapping table cannot answer from a category string alone: viewer
 * spellings that differ from the schema, types resolved per instance, and
 * containers above the ones the table maps.
 */
const OVERRIDES: Record<string, string> = {
  BUILDINGSTORY: "storey",
  FACILITY: "facility",
  PROJECT: "project",
  SPACE: "space",
  ZONE: "space.zone",
};

/** `IFCWALL`, `IfcWall` and `WALL` all reduce to `WALL`. */
function normalise(category: string): string {
  const upper = category.trim().toUpperCase();
  return upper.startsWith("IFC") ? upper.slice(3) : upper;
}

const CLASS_BY_CATEGORY = new Map(
  IFC_MAP.entries.flatMap((entry) =>
    entry.target.as === "node" && entry.target.class
      ? [[normalise(entry.source), entry.target.class] as const]
      : []
  )
);

/**
 * The class an element of this category *would* import as.
 *
 * For hosts that show source data before an import has happened, or without
 * one: an inspector tree, pre-import grouping. Derived from the mapping table
 * rather than restated, so the label a user sees can never drift from what an
 * import would actually produce.
 */
export function ifcClassFromCategory(category?: string | null): string {
  if (!category) {
    return "element";
  }
  const key = normalise(category);
  return (
    OVERRIDES[key] ??
    CLASS_BY_CATEGORY.get(key) ??
    `element.${key.toLowerCase()}`
  );
}
