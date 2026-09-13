import { describe, expect, it } from "vitest";

import { SPACE_BOUNDARY_ENTITIES } from "./mapping";
import { scanSpaceBoundaries } from "./scan";
import { synthesizeSpaceBoundaries } from "./synthesize";

describe("space boundaries", () => {
  it("maps both boundary levels onto one edge", () => {
    expect(SPACE_BOUNDARY_ENTITIES.map((e) => e.source)).toEqual([
      "IfcRelSpaceBoundary",
      "IfcRelSpaceBoundary2ndLevel",
    ]);
    for (const entry of SPACE_BOUNDARY_ENTITIES) {
      expect(entry.target).toMatchObject({ as: "edge", type: "bounds" });
    }
  });

  it("points element to space, so bounds reads one way", () => {
    for (const entry of SPACE_BOUNDARY_ENTITIES) {
      expect(entry.target).toMatchObject({
        endpoints: { from: "RelatedBuildingElement", to: "RelatingSpace" },
      });
    }
  });

  it("makes no judgement about passability", () => {
    // A shared wall is not a door. connectsTo decides that, not this.
    for (const entry of SPACE_BOUNDARY_ENTITIES) {
      if (entry.target.as === "edge") {
        expect(entry.target.type).not.toBe("connectsTo");
      }
    }
  });
});

describe("scanning and synthesis", () => {
  const PHYSICAL = `
#1=IFCSPACE('room-1',$,$,$,$,$,$,$,$,$,$);
#2=IFCWALL('wall-1',$,$,$,$,$,$,$);
#3=IFCRELSPACEBOUNDARY('b-1',$,$,$,#1,#2,$,.PHYSICAL.,.INTERNAL.);
`;
  const VIRTUAL = `
#1=IFCSPACE('room-1',$,$,$,$,$,$,$,$,$,$);
#3=IFCRELSPACEBOUNDARY('b-1',$,$,$,#1,$,$,.VIRTUAL.,.INTERNAL.);
`;

  it("reads a physical boundary as an element bounding a space", () => {
    const [boundary] = scanSpaceBoundaries(PHYSICAL);
    expect(boundary).toMatchObject({
      guid: "b-1",
      spaceGuid: "room-1",
      elementGuid: "wall-1",
      isVirtual: false,
    });
  });

  it("reads a virtual boundary, which has no element at all", () => {
    const [boundary] = scanSpaceBoundaries(VIRTUAL);
    expect(boundary).toMatchObject({ elementGuid: null, isVirtual: true });
  });

  it("records which spaces an element separates, for openings/", () => {
    const { spacesByElement } = synthesizeSpaceBoundaries(
      [
        { guid: "b1", spaceGuid: "a", elementGuid: "wall", isVirtual: false },
        { guid: "b2", spaceGuid: "b", elementGuid: "wall", isVirtual: false },
      ],
      { mapped: new Set(["a", "b", "wall"]) }
    );
    expect([...(spacesByElement.get("wall") ?? [])].sort()).toEqual(["a", "b"]);
  });

  it("carries virtual spaces across as data, since no edge can hold them", () => {
    const result = synthesizeSpaceBoundaries(
      [{ guid: "b1", spaceGuid: "a", elementGuid: null, isVirtual: true }],
      { mapped: new Set(["a"]) }
    );
    expect(result.virtualBoundarySpaces.has("a")).toBe(true);
    expect(result.tally.virtual).toBe(1);
    // No element, so no edge.
    expect(result.instances).toHaveLength(0);
  });

  it("drops a boundary whose endpoints did not survive mapping", () => {
    const { instances } = synthesizeSpaceBoundaries(
      [{ guid: "b1", spaceGuid: "a", elementGuid: "wall", isVirtual: false }],
      { mapped: new Set(["a"]) }
    );
    expect(instances).toHaveLength(0);
  });
});
