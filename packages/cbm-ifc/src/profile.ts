import type {
  FormatProfile,
  MappingTable,
} from "@aec-craft/platform-cbm-engine";

import { createIfcAdapter } from "./adapter";
import { ARCHITECTURE_ENTITIES } from "./architecture/mapping";
import { CONTAINMENT_ENTITIES } from "./containment/mapping";
import { IFC_FORMAT } from "./format";
import { FURNISHING_ENTITIES } from "./furnishing/mapping";
import { OPENING_ENTITIES } from "./openings/mapping";
import { PROPERTY_RULES } from "./properties";
import { SERVICES_ENTITIES } from "./services/mapping";
import { SPACE_BOUNDARY_ENTITIES } from "./space-boundaries/mapping";
import { SPATIAL_ENTITIES } from "./spatial-structure/mapping";
import { STRUCTURE_ENTITIES } from "./structure/mapping";
import type { IfcInstance, IfcModel } from "./types";

/**
 * The mapping table, assembled from the mechanism folders.
 *
 * Nothing is declared here. Every entry comes from the folder that documents
 * it, so this file is a table of contents and adding a mechanism means adding
 * one import.
 *
 * The order is what you would read them in, not what the engine needs: it
 * matches entries by type, so any order works.
 */
export const IFC_MAP: MappingTable = {
  format: IFC_FORMAT,
  version: "ADD2",
  entries: [
    ...SPATIAL_ENTITIES,
    ...ARCHITECTURE_ENTITIES,
    ...STRUCTURE_ENTITIES,
    ...SERVICES_ENTITIES,
    ...FURNISHING_ENTITIES,
    ...CONTAINMENT_ENTITIES,
    ...SPACE_BOUNDARY_ENTITIES,
    ...OPENING_ENTITIES,
  ],
  propertyRules: PROPERTY_RULES,
};

/**
 * IFC as a format profile: everything the engine needs to build a model out of
 * an IFC file, and nothing about how it does so.
 */
export const ifcProfile: FormatProfile<IfcInstance> = {
  format: IFC_FORMAT,
  map: IFC_MAP,
  adapter: (model) => createIfcAdapter(model as IfcModel),
};
