import { describe, expect, it } from "vitest";

import { createIfcAdapter } from "../adapter";
import type { IfcInstance } from "../types";
import { detectUnits } from "./detect";

const MILLIMETRE_HEADER = `
#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,$);
#2=IFCSIUNIT(*,.AREAUNIT.,$,$);
#3=IFCUNITASSIGNMENT((#1,#2));
`;

const instance = (quantities: Record<string, number>): IfcInstance => ({
  source: "IfcWall",
  sourceId: "guid",
  attributes: {},
  psets: {},
  quantities: { Qto_WallBaseQuantities: quantities },
});

describe("unit detection", () => {
  it("reads the file's own factor rather than assuming SI", () => {
    const factors = detectUnits(MILLIMETRE_HEADER);
    expect(factors?.length).toBe(1e-3);
  });

  it("states nothing when the file states nothing", () => {
    expect(detectUnits("ISO-10303-21; no assignment here")).toBeNull();
  });
});

describe("the adapter's unit conversion", () => {
  it("converts a measured value into the unit the rule asked for", () => {
    const factors = detectUnits(MILLIMETRE_HEADER);
    const adapter = createIfcAdapter({
      instances: [],
      ...(factors ? { unitFactors: factors } : {}),
    });
    const length = adapter.resolve(
      instance({ Length: 4000 }),
      "Qto_WallBaseQuantities.Length",
      "m"
    );
    expect(length).toBe(4);
  });

  it("writes no measured value when the file declared no units", () => {
    // Fails closed. Assuming SI here would store a 4000 mm wall as 4 km, and
    // nothing downstream could tell it apart from a real one.
    const adapter = createIfcAdapter({ instances: [] });
    const length = adapter.resolve(
      instance({ Length: 4000 }),
      "Qto_WallBaseQuantities.Length",
      "m"
    );
    expect(length).toBeUndefined();
  });

  it("still reads values that carry no unit", () => {
    const adapter = createIfcAdapter({ instances: [] });
    const value = adapter.resolve(
      { ...instance({}), attributes: { Name: "Wall 1" } },
      "Name"
    );
    expect(value).toBe("Wall 1");
  });
});
