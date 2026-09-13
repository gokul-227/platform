import { describe, expect, it } from "vitest";

import { FURNISHING_ENTITIES } from "./mapping";

describe("furnishing", () => {
  it("maps identity only, and says so with the status", () => {
    for (const entry of FURNISHING_ENTITIES) {
      expect(entry.status).toBe("stub");
      expect(entry.fields).toEqual([{ from: "Name", to: "name" }]);
    }
  });

  it("keeps furnishing out of the fabric classes", () => {
    // openings/ relies on being able to tell furniture voids from thresholds.
    for (const entry of FURNISHING_ENTITIES) {
      if (entry.target.as === "node") {
        expect(entry.target.class).toMatch(/^element\.furni/);
      }
    }
  });
});
