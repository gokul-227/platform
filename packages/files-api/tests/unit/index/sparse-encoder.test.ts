import { describe, expect, it } from "vitest";

import {
  createSparseEncoder,
  hashTerm,
  TERM_SPACE,
  tokenize,
} from "../../../src/modules/index/sparse-encoder";

const encoder = createSparseEncoder();

describe("tokenize", () => {
  it("keeps an identifier whole and also emits its parts", () => {
    // The whole term is what distinguishes EN 1992-1-1 from EN 1992-1-2; the
    // parts are what let a looser citation still match.
    const terms = tokenize("EN 1992-1-1 applies");
    expect(terms).toContain("1992-1-1");
    expect(terms).toContain("1992");
    expect(terms).toContain("en");
  });

  it("keeps drawing numbers and revisions", () => {
    expect(tokenize("Drawing A-102 Rev C")).toContain("a-102");
  });

  it("drops function words, which match everything and distinguish nothing", () => {
    const terms = tokenize("the width of the door shall not be less than");
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("shall");
    expect(terms).not.toContain("not");
    expect(terms).toContain("width");
    expect(terms).toContain("door");
  });

  it("is case-insensitive", () => {
    expect(tokenize("Escape ROUTE")).toEqual(tokenize("escape route"));
  });

  it("drops single characters, which carry no lexical signal", () => {
    expect(tokenize("a b concrete")).toEqual(["concrete"]);
  });

  it("yields nothing for punctuation alone", () => {
    expect(tokenize("--- ... ///")).toEqual([]);
  });
});

describe("hashTerm", () => {
  it("is stable, so a term means the same thing in every document", () => {
    expect(hashTerm("concrete")).toBe(hashTerm("concrete"));
  });

  it("separates different terms", () => {
    expect(hashTerm("concrete")).not.toBe(hashTerm("timber"));
  });

  it("stays inside the term space", () => {
    for (const term of ["a", "concrete", "1992-1-1", "x".repeat(200)]) {
      const index = hashTerm(term);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(TERM_SPACE);
      expect(Number.isInteger(index)).toBe(true);
    }
  });
});

describe("sparse encoding", () => {
  it("emits ascending indices, which Pinecone requires", () => {
    const { indices } = encoder.encodeDocument(
      "concrete cover durability exposure class carbonation"
    );
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("pairs every index with a weight", () => {
    const vector = encoder.encodeDocument("escape route width clearance");
    expect(vector.values).toHaveLength(vector.indices.length);
    expect(vector.indices.length).toBeGreaterThan(0);
  });

  it("weights a query term uniformly, leaving the shape to the document side", () => {
    const { values } = encoder.encodeQuery("escape route width");
    expect(new Set(values)).toEqual(new Set([1]));
  });

  it("counts a repeated query term once", () => {
    const once = encoder.encodeQuery("concrete");
    const thrice = encoder.encodeQuery("concrete concrete concrete");
    expect(thrice).toEqual(once);
  });

  it("saturates term frequency, so repetition cannot run away", () => {
    const weightOf = (text: string): number => {
      const vector = encoder.encodeDocument(text);
      const at = vector.indices.indexOf(hashTerm("concrete"));
      return vector.values[at] as number;
    };
    const twice = weightOf("concrete concrete");
    const twenty = weightOf("concrete ".repeat(20));
    expect(twenty).toBeGreaterThan(twice);
    // Ten times the mentions is nowhere near ten times the weight.
    expect(twenty).toBeLessThan(twice * 3);
  });

  it("is deterministic", () => {
    const text = "party wall sound reduction index 53 dB";
    expect(encoder.encodeDocument(text)).toEqual(encoder.encodeDocument(text));
  });

  it("yields an empty vector for a query of nothing but stopwords", () => {
    expect(encoder.encodeQuery("the and of to")).toEqual({
      indices: [],
      values: [],
    });
  });

  /**
   * The property the whole lexical half exists for: an exact identifier scores
   * against the document that contains it and not against a sibling standard.
   */
  it("scores an exact identifier above a near neighbour", () => {
    const query = encoder.encodeQuery("EN 1992-1-1");
    const dot = (text: string): number => {
      const doc = encoder.encodeDocument(text);
      let total = 0;
      for (const [position, index] of query.indices.entries()) {
        const at = doc.indices.indexOf(index);
        if (at >= 0) {
          total +=
            (query.values[position] as number) * (doc.values[at] as number);
        }
      }
      return total;
    };
    const exact = dot("Design to EN 1992-1-1 for concrete structures.");
    const sibling = dot("Design to EN 1993-1-1 for steel structures.");
    const unrelated = dot("Acoustic separation between dwellings.");

    expect(exact).toBeGreaterThan(sibling);
    expect(sibling).toBeGreaterThan(unrelated);
    expect(unrelated).toBe(0);
  });
});
