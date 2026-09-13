import { describe, expect, it } from "vitest";

import { SERVICES_ENTITIES } from "./mapping";

const elements = SERVICES_ENTITIES.filter(
  (entry) => entry.sourceType === "element"
);

describe("services", () => {
  it("admits distribution elements as stubs, honestly", () => {
    // Breadth without depth. The status is what stops coverage overstating it.
    expect(elements.length).toBeGreaterThan(20);
    for (const entry of elements) {
      expect(entry.status).toBe("stub");
    }
  });

  it("carries the one MEP relationship IFC states plainly", () => {
    const serves = SERVICES_ENTITIES.find(
      (entry) => entry.source === "IfcRelServicesBuildings"
    );
    expect(serves?.target).toEqual({
      as: "edge",
      type: "serves",
      endpoints: { from: "RelatingSystem", to: "RelatedBuildings" },
    });
  });

  it("does not claim network connectivity it cannot follow", () => {
    const sources = SERVICES_ENTITIES.map((entry) => entry.source);
    expect(sources).not.toContain("IfcRelConnectsPortToElement");
    expect(sources).not.toContain("IfcDistributionPort");
  });

  it("has not yet closed the IfcFlowTerminal gap", () => {
    // 102 instances on a real hospital export. Asserted so closing it updates the doc.
    expect(SERVICES_ENTITIES.map((e) => e.source)).not.toContain(
      "IfcFlowTerminal"
    );
  });
});
