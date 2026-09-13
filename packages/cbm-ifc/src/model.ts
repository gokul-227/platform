import { synthesizeContainment } from "./containment/synthesize";
import type { IfcHosting, IfcOpenPassage } from "./openings/scan";
import {
  type IfcOpenPassageTally,
  synthesizeOpenings,
} from "./openings/synthesize";
import { IFC_MAP } from "./profile";
import type { IfcSpaceBoundary } from "./space-boundaries/scan";
import {
  type IfcBoundaryTally,
  synthesizeSpaceBoundaries,
} from "./space-boundaries/synthesize";
import type { IfcInstance, IfcModel, IfcSource } from "./types";
import type { IfcUnitFactors } from "./units";

/**
 * Readers spell entity types in upper case; the mapping table uses the schema's
 * own casing.
 *
 * Built from the table's own entries rather than from a list of every IFC type,
 * so it covers exactly what maps and cannot drift from it. A type absent here is
 * one nothing maps, which is precisely the case that should be counted as drift
 * rather than translated.
 */
const PROPER_CASE = new Map(
  IFC_MAP.entries.map((entry) => [entry.source.toUpperCase(), entry.source])
);

/**
 * What the file contained and what became of it.
 *
 * Every field answers "what did this import lose, and why". `unmappedTypes` is
 * the one to read first: it names the coverage gap this particular file hit,
 * rather than a total that cannot be acted on.
 */
export interface IfcModelReport {
  boundaries: IfcBoundaryTally;
  /** Elements that reached the mapping. */
  instances: number;
  openPassages: IfcOpenPassageTally;
  /** IFC types present in the file that nothing maps, by occurrence count. */
  unmappedTypes: Record<string, number>;
  /** Elements carrying no GlobalId. A malformed file, not a coverage gap. */
  withoutGuid: number;
}

export interface IfcBuildResult {
  model: IfcModel;
  report: IfcModelReport;
  /** Spaces open to each other with nothing physical between them. */
  virtualBoundarySpaces: Set<string>;
}

export interface IfcBuildInput {
  boundaries?: readonly IfcSpaceBoundary[];
  hostings?: readonly IfcHosting[];
  openPassages?: readonly IfcOpenPassage[];
  source: IfcSource;
  unitFactors?: IfcUnitFactors;
}

/**
 * Compose one read into the model the mapping consumes.
 *
 * This is the single place the mechanisms meet, and it does nothing itself:
 * each mechanism owns its own synthesis and this calls them in the order their
 * data requires. That order is the only real constraint here.
 *
 * Boundaries must be synthesised before openings, because deciding what a
 * doorless hole joins needs to know which spaces its host wall separates, and
 * that is a by-product of reading the boundaries.
 */
export function buildIfcModel(input: IfcBuildInput): IfcBuildResult {
  const instances: IfcInstance[] = [];
  const mapped = new Set<string>();
  const typeByGuid = new Map<string, string>();
  const unmappedTypes: Record<string, number> = {};
  let withoutGuid = 0;

  for (const element of input.source.elements) {
    const properCase = element.category
      ? PROPER_CASE.get(element.category.trim().toUpperCase())
      : undefined;
    if (!element.guid) {
      withoutGuid += 1;
      continue;
    }
    if (!properCase) {
      const category = element.category?.trim() || "unknown";
      unmappedTypes[category] = (unmappedTypes[category] ?? 0) + 1;
      continue;
    }
    instances.push({
      source: properCase,
      sourceId: element.guid,
      attributes: { ...element.attributes, expressId: element.expressId },
      psets: element.psets,
      quantities: element.quantities,
    });
    mapped.add(element.guid);
    typeByGuid.set(element.guid, properCase);
  }

  instances.push(
    ...synthesizeContainment(input.source.containments, { mapped })
  );

  const boundaries = synthesizeSpaceBoundaries(input.boundaries ?? [], {
    mapped,
  });
  instances.push(...boundaries.instances);

  const openings = synthesizeOpenings(
    input.hostings ?? [],
    input.openPassages ?? [],
    { mapped, spacesByElement: boundaries.spacesByElement, typeByGuid }
  );
  instances.push(...openings.instances);

  return {
    model: {
      instances,
      ...(input.unitFactors ? { unitFactors: input.unitFactors } : {}),
    },
    report: {
      boundaries: boundaries.tally,
      instances: instances.length,
      openPassages: openings.report,
      unmappedTypes,
      withoutGuid,
    },
    virtualBoundarySpaces: boundaries.virtualBoundarySpaces,
  };
}
