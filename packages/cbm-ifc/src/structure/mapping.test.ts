import { describe, expect, it } from "vitest";

import { STRUCTURE_ENTITIES } from "./mapping";

describe("structure", () => {
  it("maps the five members that carry load", () => {
    expect(STRUCTURE_ENTITIES.map((entry) => entry.source).sort()).toEqual([
      "IfcBeam",
      "IfcColumn",
      "IfcFooting",
      "IfcMember",
      "IfcPile",
    ]);
  });

  it("uses the same shape as architecture, since the difference is the question", () => {
    for (const entry of STRUCTURE_ENTITIES) {
      expect(entry.sourceType).toBe("element");
      expect(entry.fields).toEqual([{ from: "Name", to: "name" }]);
      expect(entry.target.as).toBe("node");
    }
  });

  it("does not claim the structural-analysis world", () => {
    const sources = STRUCTURE_ENTITIES.map((entry) => entry.source);
    expect(sources).not.toContain("IfcStructuralMember");
    expect(sources).not.toContain("IfcStructuralCurveMember");
  });
});
