import { describe, expect, it } from "vitest";

import { COMMON_PROPERTY_RULES } from "./common";
import { PROPERTY_RULES } from "./index";
import { QUANTITY_RULES } from "./quantities";
import { VENDOR_PROPERTY_RULES } from "./vendor";

const targetsOf = (from: string) =>
  PROPERTY_RULES.filter((rule) => rule.from === from).map((rule) => rule.to);

describe("the property layer", () => {
  it("writes one meaning from many sets", () => {
    // IsExternal appears in eight psets and means the same thing in all of them.
    const external = COMMON_PROPERTY_RULES.filter((rule) =>
      rule.from.endsWith(".IsExternal")
    );
    expect(external.length).toBeGreaterThan(5);
    for (const rule of external) {
      expect(rule.to).toBe("envelope.isExternal");
    }
  });

  it("feeds one target from many quantity sets", () => {
    // Net area is said eight different ways depending on what is measured.
    const netArea = QUANTITY_RULES.filter(
      (rule) => rule.to === "envelope.areaNet"
    );
    expect(netArea.length).toBeGreaterThan(5);
  });

  it("declares a unit on every measured quantity, so no rule knows the file's", () => {
    for (const rule of QUANTITY_RULES) {
      expect(rule.unit).toMatch(/^m2?3?$|^m$/);
    }
  });

  it("runs vendor rules before standard ones, so standard wins", () => {
    const firstVendor = PROPERTY_RULES.findIndex((rule) =>
      rule.from.startsWith("PSet_Revit_")
    );
    const firstStandard = PROPERTY_RULES.findIndex((rule) =>
      rule.from.startsWith("Qto_")
    );
    expect(firstVendor).toBeGreaterThanOrEqual(0);
    expect(firstVendor).toBeLessThan(firstStandard);
  });

  it("keeps vendor rules out of the standard set, so coverage stays honest", () => {
    for (const rule of [...COMMON_PROPERTY_RULES, ...QUANTITY_RULES]) {
      expect(rule.from).not.toMatch(/^PSet_Revit_/);
    }
    for (const rule of VENDOR_PROPERTY_RULES) {
      expect(rule.from).toMatch(/^PSet_Revit_/);
    }
  });

  it("routes a space's use to programme, never to its class", () => {
    // A change of use is a property write, not a re-classification.
    expect(targetsOf("Pset_SpaceCommon.OccupancyType")).toEqual([
      "programme.use",
    ]);
  });

  it("writes only into governed blocks", () => {
    const roots = new Set(PROPERTY_RULES.map((rule) => rule.to.split(".")[0]));
    expect([...roots].sort()).toEqual([
      "envelope",
      "material",
      "programme",
      "systems",
    ]);
  });

  it("has no duplicate source addresses fighting each other", () => {
    const standard = [...COMMON_PROPERTY_RULES, ...QUANTITY_RULES].map(
      (rule) => rule.from
    );
    expect(new Set(standard).size).toBe(standard.length);
  });
});
