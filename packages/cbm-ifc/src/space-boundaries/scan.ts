import { guidIndex, resolveGuid } from "../scan";

export interface IfcSpaceBoundary {
  /** The bounding element; null when the boundary is virtual. */
  elementGuid: string | null;
  /** The relationship's own GlobalId, so the edge has a stable identity. */
  guid: string;
  /** Nothing physical between the two spaces: they are open to each other. */
  isVirtual: boolean;
  spaceGuid: string;
}

/**
 * Both boundary levels in one expression. The physical-or-virtual enumeration
 * is the last captured group and is the reason this is scanned from text at
 * all: it is the one fact geometry cannot recover afterwards.
 */
const BOUNDARY =
  /IFCRELSPACEBOUNDARY(?:2NDLEVEL)?\s*\(\s*'([^']+)'\s*,[^,]*,[^,]*,[^,]*,\s*(#\d+)\s*,\s*(#\d+|\$)\s*,[^,]*,\s*\.(\w+)\./g;

export function scanSpaceBoundaries(text: string): IfcSpaceBoundary[] {
  const index = guidIndex(text);
  const boundaries: IfcSpaceBoundary[] = [];

  for (const [, guid, spaceRef, elementRef, physicality] of text.matchAll(
    BOUNDARY
  )) {
    const spaceGuid = resolveGuid(index, spaceRef);
    if (guid && spaceGuid) {
      boundaries.push({
        guid,
        spaceGuid,
        elementGuid: resolveGuid(index, elementRef),
        isVirtual: physicality === "VIRTUAL",
      });
    }
  }
  return boundaries;
}
