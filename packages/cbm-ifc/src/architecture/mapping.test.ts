import { describe, expect, it } from "vitest";

import { ARCHITECTURE_ENTITIES } from "./mapping";

const classOf = (source: string) => {
  const target = ARCHITECTURE_ENTITIES.find(
    (entry) => entry.source === source
  )?.target;
  return target?.as === "node" ? target.class : undefined;
};

describe("architecture", () => {
  it("collapses both IFC wall types onto one class", () => {
    // They differ only in how the profile is swept, which nothing downstream
    // reads. The original type survives in interop.sourceClass.
    expect(classOf("IfcWall")).toBe("element.wall");
    expect(classOf("IfcWallStandardCase")).toBe("element.wall");
  });

  it("nests a kind, so a query for walls finds a curtain wall", () => {
    expect(classOf("IfcWall")).toBe("element.wall");
    expect(classOf("IfcCurtainWall")).toBe("element.wall.curtain");
  });

  it("does NOT nest a part, so a query for stairs does not count flights twice", () => {
    // A flight belongs to a stair through an edge, not through its class. If
    // the dot meant both "kind of" and "part of", neither reading would be safe.
    expect(classOf("IfcStair")).toBe("element.stair");
    expect(classOf("IfcStairFlight")).toBe("element.stairFlight");
    expect(classOf("IfcRampFlight")).toBe("element.rampFlight");
  });

  it("admits the catch-all rather than dropping the element", () => {
    expect(classOf("IfcBuildingElementProxy")).toBe("element.proxy");
  });

  it("carries the synthesised connector no real file contains", () => {
    expect(classOf("IfcVirtualElement")).toBe("element.virtual");
  });

  it("maps only the name; every other property comes from properties/", () => {
    for (const entry of ARCHITECTURE_ENTITIES) {
      expect(entry.fields).toEqual([{ from: "Name", to: "name" }]);
    }
  });

  it("puts every class under the element root", () => {
    for (const entry of ARCHITECTURE_ENTITIES) {
      if (entry.target.as === "node") {
        expect(entry.target.class).toMatch(/^element\./);
      }
    }
  });
});
