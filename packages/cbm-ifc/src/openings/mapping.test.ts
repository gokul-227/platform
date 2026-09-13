import { describe, expect, it } from "vitest";

import { OPENING_ENTITIES } from "./mapping";
import { scanOpenings } from "./scan";
import { synthesizeOpenings } from "./synthesize";

/** A minimal STEP fragment: a wall voided by an opening, filled by a door. */
const DOOR_IN_WALL = `
#10=IFCWALL('wall-1',$,$,$,$,$,$,$);
#11=IFCOPENINGELEMENT('open-1',$,$,$,$,$,$,$);
#12=IFCDOOR('door-1',$,$,$,$,$,$,$);
#20=IFCRELVOIDSELEMENT('voids-1',$,$,$,#10,#11);
#21=IFCRELFILLSELEMENT('fills-1',$,$,$,#11,#12);
`;

/** The same wall, but the opening is left empty. */
const DOORLESS = `
#10=IFCWALL('wall-1',$,$,$,$,$,$,$);
#11=IFCOPENINGELEMENT('open-1',$,$,$,$,$,$,$);
#20=IFCRELVOIDSELEMENT('voids-1',$,$,$,#10,#11);
`;

describe("the mapping", () => {
  it("emits hostedIn from the filler to the host", () => {
    const fills = OPENING_ENTITIES.find(
      (entry) => entry.source === "IfcRelFillsElement"
    );
    expect(fills?.target).toEqual({
      as: "edge",
      type: "hostedIn",
      endpoints: {
        from: "RelatedBuildingElement",
        to: "RelatingBuildingElement",
      },
    });
  });

  it("ignores the opening itself, and says why", () => {
    const opening = OPENING_ENTITIES.find(
      (entry) => entry.source === "IfcOpeningElement"
    );
    expect(opening?.status).toBe("ignored");
    expect(opening?.target).toMatchObject({ as: "ignored" });
  });
});

describe("composing the two relationships", () => {
  it("finds the fact IFC never states: this door is in this wall", () => {
    const { hostings } = scanOpenings(DOOR_IN_WALL);
    expect(hostings).toEqual([
      { guid: "fills-1", hostGuid: "wall-1", fillerGuid: "door-1" },
    ]);
  });

  it("reports an unfilled opening as a passage rather than dropping it", () => {
    const { hostings, openPassages } = scanOpenings(DOORLESS);
    expect(hostings).toHaveLength(0);
    expect(openPassages).toEqual([
      { hostGuid: "wall-1", openingGuid: "open-1" },
    ]);
  });

  it("does not report a filled opening as a passage", () => {
    expect(scanOpenings(DOOR_IN_WALL).openPassages).toHaveLength(0);
  });
});

describe("synthesising doorless thresholds", () => {
  const passage = [{ hostGuid: "wall-1", openingGuid: "open-1" }];

  it("invents a passable connector when the wall separates exactly two rooms", () => {
    const { instances, report } = synthesizeOpenings([], passage, {
      mapped: new Set(["wall-1", "roomA", "roomB"]),
      spacesByElement: new Map([["wall-1", new Set(["roomA", "roomB"])]]),
      typeByGuid: new Map([["wall-1", "IfcWall"]]),
    });
    expect(report.connected).toBe(1);
    expect(
      instances.filter((i) => i.source === "IfcVirtualElement")
    ).toHaveLength(1);
    // Bounded to both rooms, so connectsTo has something to join them through.
    expect(
      instances.filter((i) => i.source === "IfcRelSpaceBoundary")
    ).toHaveLength(2);
  });

  it("refuses to guess when the wall separates more than two rooms", () => {
    const { instances, report } = synthesizeOpenings([], passage, {
      mapped: new Set(["wall-1", "a", "b", "c"]),
      spacesByElement: new Map([["wall-1", new Set(["a", "b", "c"])]]),
      typeByGuid: new Map([["wall-1", "IfcWall"]]),
    });
    // A wrong connection is worse than a missing one.
    expect(report.ambiguous).toBe(1);
    expect(instances).toHaveLength(0);
  });

  it("treats a hole in an exterior wall as exterior, not as a threshold", () => {
    const { report } = synthesizeOpenings([], passage, {
      mapped: new Set(["wall-1", "roomA"]),
      spacesByElement: new Map([["wall-1", new Set(["roomA"])]]),
      typeByGuid: new Map([["wall-1", "IfcWall"]]),
    });
    expect(report.exterior).toBe(1);
  });

  it("ignores a cutout in furniture, which is never a threshold", () => {
    const { instances, report } = synthesizeOpenings([], passage, {
      mapped: new Set(["wall-1", "roomA", "roomB"]),
      spacesByElement: new Map([["wall-1", new Set(["roomA", "roomB"])]]),
      typeByGuid: new Map([["wall-1", "IfcFurniture"]]),
    });
    expect(report.furnishing).toBe(1);
    expect(instances).toHaveLength(0);
  });

  it("drops a hosting whose endpoints did not both survive mapping", () => {
    const { instances } = synthesizeOpenings(
      [{ guid: "f", hostGuid: "wall-1", fillerGuid: "door-1" }],
      [],
      {
        mapped: new Set(["wall-1"]),
        spacesByElement: new Map(),
        typeByGuid: new Map(),
      }
    );
    expect(instances).toHaveLength(0);
  });
});
