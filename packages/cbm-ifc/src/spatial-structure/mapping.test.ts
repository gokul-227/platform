import { describe, expect, it } from "vitest";

import { SPATIAL_ENTITIES } from "./mapping";

const bySource = (source: string) =>
  SPATIAL_ENTITIES.find((entry) => entry.source === source);

describe("spatial structure", () => {
  it("maps the four containers a building model is organised by", () => {
    for (const [source, cls] of [
      ["IfcSite", "site"],
      ["IfcBuilding", "building"],
      ["IfcBuildingStorey", "storey"],
    ] as const) {
      const target = bySource(source)?.target;
      expect(target).toEqual({ as: "node", class: cls });
    }
  });

  it("leaves a space at the root rather than guessing its use", () => {
    // A room's use is not in its IFC type, and the name is not evidence.
    expect(bySource("IfcSpace")?.target).toEqual({
      as: "node",
      class: "space",
    });
  });

  it("never resolves a class per instance", () => {
    // Every class here is decided by the IFC type. Nothing is inferred from
    // text, so nothing in this package can be wrong about what a room is.
    for (const entry of SPATIAL_ENTITIES) {
      expect(entry.target).not.toHaveProperty("classFrom");
    }
  });

  it("takes a space's name from LongName, where authoring tools put it", () => {
    expect(bySource("IfcSpace")?.fields).toEqual([
      { from: "LongName", to: "name" },
    ]);
  });

  it("produces only nodes, leaving nesting to containment/", () => {
    for (const entry of SPATIAL_ENTITIES) {
      expect(entry.target.as).toBe("node");
    }
  });

  it("attributes every entry to this mechanism, so coverage can group", () => {
    for (const entry of SPATIAL_ENTITIES) {
      expect(entry.mechanism).toBe("spatial-structure");
    }
  });
});
