import { allMapped, createRelation } from "../synthesize";
import type { IfcInstance } from "../types";
import type { IfcSpaceBoundary } from "./scan";

/** What became of each space boundary in the file. */
export interface IfcBoundaryTally {
  /** Dropped: an endpoint never became a node, so no edge could name it. */
  dropped: number;
  /** Became a `bounds` edge. */
  physical: number;
  /** Seen, but carrying no element, so nothing for an edge to point at. */
  virtual: number;
}

export interface IfcBoundarySynthesis {
  instances: IfcInstance[];
  /** Which spaces each element separates. `openings/` needs this to decide
   *  what an unfilled hole joins. */
  spacesByElement: Map<string, Set<string>>;
  tally: IfcBoundaryTally;
  /** Spaces carrying at least one virtual boundary. A virtual boundary has no
   *  element, so no `bounds` edge can carry it; a host that pairs spaces
   *  geometrically reads this instead. */
  virtualBoundarySpaces: Set<string>;
}

/**
 * Turn scanned boundaries into mappable relation instances.
 *
 * Two outputs besides the instances, and both are the point.
 *
 * `spacesByElement` is what `openings/` consults to work out which two rooms a
 * doorless threshold joins. Without it, every unfilled opening would be
 * unresolvable.
 *
 * `virtualBoundarySpaces` carries the one fact that cannot survive as an edge.
 * A virtual boundary has no element, so there is nothing for a `bounds` edge to
 * point at, and the information would simply be lost. It leaves as data.
 */
export function synthesizeSpaceBoundaries(
  boundaries: readonly IfcSpaceBoundary[],
  context: { mapped: ReadonlySet<string> }
): IfcBoundarySynthesis {
  const instances: IfcInstance[] = [];
  const spacesByElement = new Map<string, Set<string>>();
  const virtualBoundarySpaces = new Set<string>();
  const tally: IfcBoundaryTally = { dropped: 0, physical: 0, virtual: 0 };

  for (const boundary of boundaries) {
    if (boundary.isVirtual) {
      tally.virtual += 1;
      if (context.mapped.has(boundary.spaceGuid)) {
        virtualBoundarySpaces.add(boundary.spaceGuid);
      }
      continue;
    }

    const { elementGuid, spaceGuid } = boundary;
    if (!(elementGuid && allMapped(context.mapped, spaceGuid, elementGuid))) {
      tally.dropped += 1;
      continue;
    }

    const separated = spacesByElement.get(elementGuid) ?? new Set<string>();
    separated.add(spaceGuid);
    spacesByElement.set(elementGuid, separated);

    tally.physical += 1;
    instances.push(
      createRelation("IfcRelSpaceBoundary", boundary.guid, {
        RelatingSpace: spaceGuid,
        RelatedBuildingElement: elementGuid,
      })
    );
  }

  return { instances, spacesByElement, tally, virtualBoundarySpaces };
}
