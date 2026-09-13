import { allMapped, createRelation } from "../synthesize";
import type { IfcInstance } from "../types";
import type { IfcHosting, IfcOpenPassage } from "./scan";

/**
 * Voids in furniture and casework. A cabinet cutout or a sink hole is not a
 * threshold, and treating one as passable would connect a room to a cupboard.
 */
const FURNISHING = new Set([
  "IfcFurnishingElement",
  "IfcFurniture",
  "IfcSystemFurnitureElement",
]);

/** What became of each unfilled opening. The ones we cannot resolve are the
 *  honest measure of how much of the building is joined up. */
export interface IfcOpenPassageTally {
  /** Host separates more than two spaces; which two the hole joins needs
   *  geometry we do not have here. */
  ambiguous: number;
  /** Resolved into a passable connector. */
  connected: number;
  /** Host bounds fewer than two imported spaces: an external door or a
   *  dangling reference. */
  exterior: number;
  /** A cutout in furniture, never a threshold. */
  furnishing: number;
}

export interface IfcOpeningSynthesis {
  instances: IfcInstance[];
  report: IfcOpenPassageTally;
}

/**
 * Turn the composed hostings and the leftover holes into mappable instances.
 *
 * Hostings become the synthetic `IfcRelFillsElement` the mapping expects, with
 * the host already resolved.
 *
 * An unfilled opening is harder. There is no element to point at, so where its
 * host wall separates exactly two spaces we invent a passable connector, an
 * `IfcVirtualElement`, and bound both spaces to it. The two rooms are then
 * joined through a node, which is what makes the threshold traversable.
 *
 * Where the wall separates more than two spaces, we stop. Which two the hole
 * joins is a geometric question and guessing would connect rooms that are not
 * connected, which is worse than leaving them apart.
 */
export function synthesizeOpenings(
  hostings: readonly IfcHosting[],
  openPassages: readonly IfcOpenPassage[],
  context: {
    /** GlobalIds that became instances. */
    mapped: ReadonlySet<string>;
    /** Which spaces each bounding element separates, from space-boundaries. */
    spacesByElement: ReadonlyMap<string, ReadonlySet<string>>;
    /** GlobalId to IFC type, for the furnishing test. */
    typeByGuid: ReadonlyMap<string, string>;
  }
): IfcOpeningSynthesis {
  const instances: IfcInstance[] = [];
  const report: IfcOpenPassageTally = {
    ambiguous: 0,
    connected: 0,
    exterior: 0,
    furnishing: 0,
  };

  for (const hosting of hostings) {
    if (!allMapped(context.mapped, hosting.hostGuid, hosting.fillerGuid)) {
      continue;
    }
    instances.push(
      createRelation("IfcRelFillsElement", hosting.guid, {
        RelatingBuildingElement: hosting.hostGuid,
        RelatedBuildingElement: hosting.fillerGuid,
      })
    );
  }

  for (const passage of openPassages) {
    const hostType = context.typeByGuid.get(passage.hostGuid);
    if (hostType && FURNISHING.has(hostType)) {
      report.furnishing += 1;
      continue;
    }

    const separated = context.spacesByElement.get(passage.hostGuid);
    const spaces = separated
      ? [...separated].filter((guid) => context.mapped.has(guid))
      : [];

    if (spaces.length < 2) {
      report.exterior += 1;
      continue;
    }
    if (spaces.length > 2) {
      report.ambiguous += 1;
      continue;
    }

    const [first, second] = spaces;
    if (!(first && second)) {
      continue;
    }

    instances.push(
      createRelation("IfcVirtualElement", passage.openingGuid, {
        Name: "Open passage",
      })
    );
    for (const space of [first, second]) {
      instances.push(
        createRelation(
          "IfcRelSpaceBoundary",
          `openPassage:${passage.openingGuid}:${space}`,
          {
            RelatingSpace: space,
            RelatedBuildingElement: passage.openingGuid,
          }
        )
      );
    }
    report.connected += 1;
  }

  return { instances, report };
}
