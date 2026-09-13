import { describe, expect, it } from "vitest";

import { CONTAINMENT_ENTITIES } from "./mapping";

describe("containment", () => {
  it("collapses both IFC containment relationships onto one edge", () => {
    expect(CONTAINMENT_ENTITIES).toHaveLength(2);
    for (const entry of CONTAINMENT_ENTITIES) {
      expect(entry.target).toMatchObject({ as: "edge", type: "contains" });
    }
  });

  it("reads container first in both, so direction cannot disagree", () => {
    const [aggregates, spatial] = CONTAINMENT_ENTITIES;
    expect(aggregates?.target).toMatchObject({
      endpoints: { from: "RelatingObject", to: "RelatedObjects" },
    });
    expect(spatial?.target).toMatchObject({
      endpoints: { from: "RelatingStructure", to: "RelatedElements" },
    });
  });

  it("leaves repairing a missing tree to the derive stage", () => {
    // hierarchy.containment does that, and tags its edges `spine`.
    for (const entry of CONTAINMENT_ENTITIES) {
      expect(entry.source).toMatch(/^IfcRel/);
    }
  });
});
