import type { SourceInstance } from "@aec-craft/platform-cbm-engine";

import type { IfcUnitFactors } from "./units/factors";

/**
 * The package's data vocabulary, in the order the data moves through it.
 *
 * A reader hands over `IfcSource`. `buildIfcModel` validates it into
 * `IfcModel`: an element with no GlobalId or of a type nothing maps is dropped
 * there, which is why the two shapes differ and why neither can be the other.
 * Behaviour lives in the mechanism folders; this file is only the shapes.
 */

// ---------------------------------------------------------------- what comes in

/** One exported element, exactly as a reader found it. */
export interface IfcSourceElement {
  attributes: Record<string, unknown>;
  /** The entity type as the reader spells it, e.g. `IFCWALLSTANDARDCASE`. */
  category: string | null;
  /** The reader's own handle, carried through to `IfcInstance.attributes` so a
   *  host holding geometry can line an element up with it. Nothing here reads
   *  it. */
  expressId: number;
  /** The GlobalId; null for items that have none, which are dropped. */
  guid: string | null;
  psets: Record<string, Record<string, unknown>>;
  quantities: Record<string, Record<string, unknown>>;
}

/** A parent-child pair from the spatial structure, by GlobalId. */
export interface IfcSourceContainment {
  childGuid: string;
  parentGuid: string;
}

/**
 * Everything one read produced.
 *
 * Two readers produce this: the Node one in `read/`, and a browser host that
 * already has the model loaded. Semantics only, and no place for geometry:
 * what an element *is* and what it *relates to* is this package's job, where
 * it sits in space is not.
 */
export interface IfcSource {
  containments: IfcSourceContainment[];
  elements: IfcSourceElement[];
}

// ------------------------------------------------------- what the mapping sees

/**
 * A resolved IFC entity: identity plus its addressable data.
 *
 * A `IfcSourceElement` that survived validation: it has a GlobalId and a type the
 * table maps. Deliberately not a parse tree, so nothing in the mapping folders
 * ever sees a STEP line.
 */
export interface IfcInstance extends SourceInstance {
  /** Direct attributes and relationship references (Name, LongName, RelatingStructure). */
  attributes: Record<string, unknown>;
  /** Property sets: set name to its properties. */
  psets: Record<string, Record<string, unknown>>;
  /** Quantity sets: set name to its quantities. */
  quantities: Record<string, Record<string, unknown>>;
  /** The IFC entity type, e.g. `IfcWall`. */
  source: string;
  /** The GlobalId. Stable across edits, which is what makes re-import converge. */
  sourceId: string;
}

/** A read model: the instances plus how to interpret their numbers. */
export interface IfcModel {
  instances: IfcInstance[];
  /**
   * Per-measure conversion to SI, from the file header. Length, area and
   * volume routinely disagree within one file, so a single scale cannot
   * express them.
   */
  unitFactors?: IfcUnitFactors;
}
