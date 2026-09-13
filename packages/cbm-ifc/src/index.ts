// IFC as a cognitive building model: the pure profile.
//
// The Node reader lives at `@aec-craft/platform-cbm-ifc/read`, so importing
// this in a browser never pulls the WASM kernel in behind it.

export { createIfcAdapter } from "./adapter";
export { IFC_STANDARD_PROPERTIES } from "./catalog";
export { ifcClassFromCategory } from "./category";
export { IFC_FORMAT } from "./format";
export {
  buildIfcModel,
  type IfcBuildInput,
  type IfcBuildResult,
  type IfcModelReport,
} from "./model";
export type { IfcHosting, IfcOpenPassage } from "./openings/scan";
export { type IfcOpeningScan, scanOpenings } from "./openings/scan";
export { IFC_MAP, ifcProfile } from "./profile";
export { PROPERTY_RULES, VENDOR_PROPERTY_RULES } from "./properties";
export { guidIndex, type LineRef, resolveGuid } from "./scan";
export {
  type IfcSpaceBoundary,
  scanSpaceBoundaries,
} from "./space-boundaries/scan";
export { allMapped, createRelation } from "./synthesize";
export type {
  IfcInstance,
  IfcModel,
  IfcSource,
  IfcSourceContainment,
  IfcSourceElement,
} from "./types";
export { detectUnits, type IfcUnitFactors, SI } from "./units";
