import { describe, expect, it } from "vitest";

import type { VectorHit } from "../../../src/modules/index/file.index.seams";
import { fuseRankings } from "../../../src/modules/index/fusion";

function hit(fileId: string, chunkIndex: number, score: number): VectorHit {
  return {
    fileId,
    fileName: `${fileId}.pdf`,
    chunkIndex,
    text: `${fileId}#${chunkIndex}`,
    heading: null,
    page: null,
    score,
  };
}

const keys = (hits: VectorHit[]): string[] =>
  hits.map((entry) => `${entry.fileId}#${entry.chunkIndex}`);

describe("fuseRankings", () => {
  it("puts what both rankings found above what either found alone", () => {
    const semantic = [hit("a", 0, 0.9), hit("b", 0, 0.8), hit("c", 0, 0.7)];
    const lexical = [hit("c", 0, 12), hit("d", 0, 9)];

    // `c` is second and first; nothing else appears twice.
    expect(keys(fuseRankings([semantic, lexical], 10))[0]).toBe("c#0");
  });

  /**
   * The reason this is rank fusion and not score fusion: sparse weights are
   * unbounded positives while cosine sits in [-1, 1], so adding raw scores would
   * let the lexical half decide every ranking on its own.
   */
  it("ignores score magnitude entirely", () => {
    const semantic = [hit("a", 0, 0.99)];
    const lexicalHuge = [hit("b", 0, 4000)];
    const lexicalTiny = [hit("b", 0, 0.0001)];

    expect(keys(fuseRankings([semantic, lexicalHuge], 10))).toEqual(
      keys(fuseRankings([semantic, lexicalTiny], 10))
    );
  });

  it("keeps a single ranking in its own order", () => {
    const semantic = [hit("a", 0, 0.9), hit("b", 1, 0.5), hit("c", 2, 0.1)];
    expect(keys(fuseRankings([semantic], 10))).toEqual(["a#0", "b#1", "c#2"]);
  });

  it("treats chunks of one file as separate hits", () => {
    const semantic = [hit("a", 0, 0.9), hit("a", 5, 0.8)];
    expect(keys(fuseRankings([semantic], 10))).toEqual(["a#0", "a#5"]);
  });

  it("de-duplicates a hit both rankings returned", () => {
    const both = [hit("a", 0, 0.9)];
    const fused = fuseRankings([both, both], 10);
    expect(fused).toHaveLength(1);
  });

  it("cuts to topK", () => {
    const many = Array.from({ length: 20 }, (_u, i) => hit("a", i, 1 - i / 20));
    expect(fuseRankings([many], 5)).toHaveLength(5);
  });

  it("survives an empty ranking, which is a query no lexical term matched", () => {
    const semantic = [hit("a", 0, 0.9), hit("b", 0, 0.5)];
    expect(keys(fuseRankings([semantic, []], 10))).toEqual(["a#0", "b#0"]);
  });

  it("returns nothing when neither ranking found anything", () => {
    expect(fuseRankings([[], []], 10)).toEqual([]);
  });

  it("replaces the component score with the fusion score", () => {
    const [top] = fuseRankings([[hit("a", 0, 0.9)], [hit("a", 0, 5000)]], 10);
    // Two first places at k=60: 2/(60+1).
    expect(top?.score).toBeCloseTo(2 / 61, 10);
  });

  it("carries the hit's text and metadata through", () => {
    const [top] = fuseRankings([[hit("a", 3, 0.9)]], 10);
    expect(top?.fileName).toBe("a.pdf");
    expect(top?.text).toBe("a#3");
    expect(top?.chunkIndex).toBe(3);
  });
});
