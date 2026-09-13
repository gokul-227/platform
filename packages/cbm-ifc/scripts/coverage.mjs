/**
 * Print the coverage report. Run: pnpm coverage
 *
 * The entity denominator is asked of web-ifc here rather than committed as a
 * generated file. It is only ever needed by this script, this script only ever
 * runs in Node, and a thousand lines of checked-in data drift in the flattering
 * direction the moment anyone forgets to regenerate them.
 */
import { coverage, formatCoverage } from "@aec-craft/platform-cbm-engine";
import * as WebIfc from "web-ifc";

import { IFC_MAP, IFC_STANDARD_PROPERTIES } from "../dist/index.js";

/** Spatial types the kernel does not count as elements, but a building model is
 *  organised by. Mirrors the reader's own list. */
const SPATIAL = new Set([
  "IFCBUILDING",
  "IFCBUILDINGSTOREY",
  "IFCEXTERNALSPATIALELEMENT",
  "IFCSITE",
  "IFCSPACE",
  "IFCSPATIALELEMENT",
  "IFCSPATIALSTRUCTUREELEMENT",
  "IFCSPATIALZONE",
]);

const IFC_CONSTANT = /^IFC/;

const api = new WebIfc.IfcAPI();
await api.Init();

const entities = [];
const seen = new Set();
let notApplicable = 0;

for (const [name, code] of Object.entries(WebIfc)) {
  if (!(IFC_CONSTANT.test(name) && typeof code === "number")) {
    continue;
  }
  let typeName;
  try {
    typeName = api.GetNameFromTypeCode(code);
  } catch {
    continue;
  }
  if (!typeName?.startsWith("Ifc") || seen.has(typeName)) {
    continue;
  }
  seen.add(typeName);

  const upper = typeName.toUpperCase();
  if (typeName.startsWith("IfcRel")) {
    entities.push({ source: typeName, sourceType: "relation" });
  } else if (SPATIAL.has(upper)) {
    entities.push({ source: typeName, sourceType: "spatial" });
  } else if (api.IsIfcElement(code)) {
    entities.push({ source: typeName, sourceType: "element" });
  } else {
    // Resource, geometry and measure types nothing would ever map. Counted so
    // the size of the format is visible, never counted against coverage.
    notApplicable += 1;
  }
}

entities.sort((one, two) => one.source.localeCompare(two.source));

console.log(
  formatCoverage(
    coverage(IFC_MAP, {
      entities,
      na: notApplicable,
      properties: IFC_STANDARD_PROPERTIES,
    })
  )
);
