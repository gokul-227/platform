import { describe, expect, it } from "vitest";
import {
  ANCESTOR_PATH_PREFIXES,
  CANONICAL_BLOCK_KEYS,
  CANONICAL_CLASSES,
  CANONICAL_EDGE_TYPES,
  criterionSchema,
  nodeTypeFromClass,
  PROGRAMME_USES,
  ruleBlocksSchema,
  sourceBlocksSchema,
} from "../../src";

/** The spec's worked example, which the blocks exist to hold. */
const SETBACK_RULE = {
  selector: {
    classes: ["element.wall"],
    where: [{ path: "programme.isExternalWall", operator: "eq", value: true }],
    intents: ["newBuild", "extension", "storeyAddition"],
    unless: [
      [
        { path: "intent.type", operator: "eq", value: "storeyAddition" },
        { path: "intent.storeysAdded", operator: "lte", value: 2 },
      ],
    ],
    jurisdictions: ["DE-BW"],
  },
  criterion: {
    measure: {
      type: "analysis",
      analysis: "setback",
      field: "depthProvidedM",
      measurand: "lbobw.setbackDepth",
      unit: "m",
    },
    cases: [
      {
        nummer: "2",
        order: 1,
        when: [
          {
            path: "project.landUseCategory",
            operator: "in",
            value: ["kerngebiet", "dorfgebiet"],
          },
        ],
        constraints: [
          {
            operator: "gte",
            ref: { path: "envelope.wallHeight" },
            factor: 0.2,
          },
        ],
        quote: "in Kerngebieten, Dorfgebieten … 0,2 der Wandhöhe",
      },
      {
        nummer: "1",
        order: 3,
        when: [],
        constraints: [
          {
            operator: "gte",
            ref: { path: "envelope.wallHeight" },
            factor: 0.4,
          },
        ],
        quote: "allgemein 0,4 der Wandhöhe",
      },
    ],
    onNoCase: "skip",
  },
  enforcement: {
    severity: "mandatory",
    authority: "untere Baurechtsbehörde",
    canDeviate: true,
    deviationBasis: "§ 56 (2)",
  },
  lifecycle: { status: "active", since: "2026-07-30" },
  provenance: {
    sourceId: "src-lbobw-5-7",
    quote: "Die Tiefe der Abstandsflächen beträgt …",
    instrument: "LBO BW",
    article: "§ 5 (7) Satz 1",
    method: "llm",
    confidence: 0.91,
  },
};

describe("rule blocks", () => {
  it("holds the spec's worked example", () => {
    expect(ruleBlocksSchema.parse(SETBACK_RULE)).toMatchObject({
      criterion: { onNoCase: "skip" },
    });
  });

  it("keeps unknown blocks and unknown keys, because schemas describe", () => {
    const parsed = ruleBlocksSchema.parse({
      ...SETBACK_RULE,
      somethingNew: { whatever: 1 },
    });
    expect(parsed).toHaveProperty("somethingNew");
  });

  it("selects a pinned node without an edge", () => {
    const parsed = ruleBlocksSchema.parse({
      selector: { classes: ["space.kitchen"], nodeIds: ["4e7c1a92"] },
    });
    expect(parsed.selector?.nodeIds).toEqual(["4e7c1a92"]);
  });

  it("holds a minimum-area rule as class plus measured path", () => {
    const parsed = criterionSchema.parse({
      measure: { type: "path", path: "envelope.areaNet", unit: "m2" },
      constraints: [{ operator: "gte", value: 6 }],
    });
    expect(parsed.measure.type).toBe("path");
  });
});

describe("criterion validation rules", () => {
  it("rejects both constraints and cases", () => {
    expect(() =>
      criterionSchema.parse({
        measure: { type: "path", path: "envelope.areaNet" },
        constraints: [{ operator: "gte", value: 6 }],
        cases: [
          { order: 1, when: [], constraints: [{ operator: "gte", value: 7 }] },
        ],
      })
    ).toThrow(/exactly one/);
  });

  it("rejects neither constraints nor cases", () => {
    expect(() =>
      criterionSchema.parse({
        measure: { type: "path", path: "envelope.areaNet" },
      })
    ).toThrow(/exactly one/);
  });

  it("rejects two open cases", () => {
    expect(() =>
      criterionSchema.parse({
        measure: { type: "path", path: "envelope.areaNet" },
        cases: [
          { order: 1, when: [], constraints: [{ operator: "gte", value: 6 }] },
          { order: 2, when: [], constraints: [{ operator: "gte", value: 7 }] },
        ],
      })
    ).toThrow(/at most one open case/);
  });

  it("rejects an open case that is not evaluated last", () => {
    expect(() =>
      criterionSchema.parse({
        measure: { type: "path", path: "envelope.areaNet" },
        cases: [
          { order: 1, when: [], constraints: [{ operator: "gte", value: 6 }] },
          {
            order: 2,
            when: [
              { path: "project.landUseCategory", operator: "eq", value: "x" },
            ],
            constraints: [{ operator: "gte", value: 7 }],
          },
        ],
      })
    ).toThrow(/highest `order`/);
  });
});

describe("source blocks", () => {
  it("holds a citation spine and nothing extracted", () => {
    const parsed = sourceBlocksSchema.parse({
      citation: {
        fileId: "f-lbo-bw-2023",
        level: "item",
        ordinal: "2",
        path: ["34", "1", "2"],
      },
      anchor: { format: "pdf", page: 12, textSha: "abc" },
      lifecycle: { status: "inForce", since: "2023-08-01" },
    });
    expect(parsed.citation?.path).toEqual(["34", "1", "2"]);
  });
});

describe("vocabulary composition", () => {
  it("counts the rule and source blocks as canonical", () => {
    for (const key of [
      "selector",
      "criterion",
      "enforcement",
      "lifecycle",
      "provenance",
      "citation",
      "anchor",
      "publication",
    ]) {
      expect(CANONICAL_BLOCK_KEYS).toContain(key);
    }
  });

  it("no longer carries governs", () => {
    expect(CANONICAL_EDGE_TYPES).not.toContain("governs");
    expect(CANONICAL_EDGE_TYPES).toContain("modifies");
  });

  it("counts fire as a canonical block, since the corpus needs it", () => {
    expect(CANONICAL_BLOCK_KEYS).toContain("fire");
  });

  it("spells an ancestor hop with the ancestor's class root", () => {
    for (const prefix of ["site", "building", "storey", "space"]) {
      expect(ANCESTOR_PATH_PREFIXES).toContain(prefix);
    }
  });

  it("suggests the uses an importer and a rule both have to hit", () => {
    for (const use of ["circulation", "sanitary", "kitchen", "treatment"]) {
      expect(PROGRAMME_USES).toContain(use);
    }
  });

  it("accepts null where a producer means not-applicable", () => {
    const parsed = criterionSchema.parse({
      measure: {
        type: "path",
        path: "envelope.areaNet",
        unit: null,
        method: null,
      },
      constraints: [{ operator: "gte", value: 6 }],
    });
    expect(parsed.measure).toMatchObject({ type: "path" });
  });

  it("lets a classifying rule assign instead of check", () => {
    const parsed = criterionSchema.parse({
      assigns: { path: "fire.buildingClass", value: "sonderbau" },
    });
    expect(parsed.assigns).toMatchObject({ path: "fire.buildingClass" });
  });

  it("refuses a rule that both assigns and constrains", () => {
    expect(() =>
      criterionSchema.parse({
        assigns: { path: "fire.buildingClass", value: "sonderbau" },
        measure: { type: "path", path: "envelope.areaNet" },
        constraints: [{ operator: "gte", value: 6 }],
      })
    ).toThrow(/classifies, it does not check/);
  });

  it("still requires a measure when the rule checks", () => {
    expect(() =>
      criterionSchema.parse({ constraints: [{ operator: "gte", value: 6 }] })
    ).toThrow(/needs a measure/);
  });

  it("lets a judgement carry no bound, because the answer is the verdict", () => {
    const parsed = criterionSchema.parse({
      measure: { type: "judgement", prompt: "Ist die Belüftung ausreichend?" },
    });
    expect(parsed.measure.type).toBe("judgement");
  });

  it("suggests space leaves that resolve to the object type", () => {
    expect(CANONICAL_CLASSES).toContain("space.kitchen");
    expect(nodeTypeFromClass("space.kitchen")).toBe("object");
  });
});
