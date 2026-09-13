import { describe, expect, it } from "vitest";

import { createStructureChunker } from "../../../src/modules/index/chunker";
import type { VectorHit } from "../../../src/modules/index/file.index.seams";
import {
  budgetPassages,
  buildPassages,
  type DocumentChunks,
  formatContext,
} from "../../../src/modules/index/passages";

const FILE_ID = "11111111-1111-1111-1111-111111111111";

function hit(overrides: Partial<VectorHit> = {}): VectorHit {
  return {
    fileId: FILE_ID,
    fileName: "spec.pdf",
    chunkIndex: 0,
    text: "chunk text",
    heading: null,
    page: null,
    score: 0.9,
    ...overrides,
  };
}

/** A document whose chunks are numbered so a merged range is readable. */
function documentOf(count: number): Map<string, DocumentChunks> {
  return new Map([
    [
      FILE_ID,
      {
        fileName: "spec.pdf",
        chunks: Array.from({ length: count }, (_unused, index) => ({
          index,
          text: `body ${index}`,
          heading: index < 3 ? "First" : "Second",
          page: index + 1,
        })),
      },
    ],
  ]);
}

describe("buildPassages", () => {
  it("expand none: one passage per hit, carrying the hit's own text", () => {
    const passages = buildPassages(
      [hit({ score: 0.9 }), hit({ chunkIndex: 5, score: 0.7 })],
      documentOf(10),
      "none"
    );
    expect(passages).toHaveLength(2);
    expect(passages.map((passage) => passage.text)).toEqual([
      "chunk text",
      "chunk text",
    ]);
  });

  it("expand neighbors: widens by one either side and merges overlapping runs", () => {
    const passages = buildPassages(
      [hit({ chunkIndex: 1, score: 0.9 }), hit({ chunkIndex: 2, score: 0.6 })],
      documentOf(10),
      "neighbors"
    );
    // 0..2 and 1..3 overlap, so they become one passage carrying the best score.
    expect(passages).toHaveLength(1);
    expect(passages[0]?.text).toBe("body 0\n\nbody 1\n\nbody 2\n\nbody 3");
    expect(passages[0]?.score).toBe(0.9);
    expect(passages[0]?.pageStart).toBe(1);
    expect(passages[0]?.pageEnd).toBe(4);
  });

  it("expand neighbors: keeps distant hits apart", () => {
    const passages = buildPassages(
      [hit({ chunkIndex: 1, score: 0.9 }), hit({ chunkIndex: 8, score: 0.6 })],
      documentOf(10),
      "neighbors"
    );
    expect(passages).toHaveLength(2);
  });

  it("expand section: pulls every chunk sharing the hit's heading", () => {
    const passages = buildPassages(
      [hit({ chunkIndex: 1, score: 0.8 })],
      documentOf(6),
      "section"
    );
    expect(passages).toHaveLength(1);
    expect(passages[0]?.text).toBe("body 0\n\nbody 1\n\nbody 2");
    expect(passages[0]?.heading).toBe("First");
  });

  it("falls back to the raw hit when the document has no stored text", () => {
    const passages = buildPassages(
      [hit({ chunkIndex: 3 })],
      new Map(),
      "section"
    );
    expect(passages).toHaveLength(1);
    expect(passages[0]?.text).toBe("chunk text");
  });

  it("falls back when the vectors remember more chunks than the text yields", () => {
    const passages = buildPassages(
      [hit({ chunkIndex: 99 })],
      documentOf(3),
      "neighbors"
    );
    expect(passages[0]?.text).toBe("chunk text");
  });

  it("ranks passages by their best hit", () => {
    const passages = buildPassages(
      [hit({ chunkIndex: 0, score: 0.2 }), hit({ chunkIndex: 8, score: 0.95 })],
      documentOf(10),
      "none"
    );
    expect(passages.map((passage) => passage.score)).toEqual([0.95, 0.2]);
  });

  it("reconstructs the ranges a real chunker produced", () => {
    const markdown = [
      "# Fire safety",
      "Escape routes must be kept clear.",
      "Doors must not be locked.",
      "## Widths",
      "Minimum width is 1.2 m.",
    ].join("\n\n");
    const chunks = createStructureChunker().chunk(markdown, { maxTokens: 12 });
    const documents = new Map([[FILE_ID, { fileName: "spec.md", chunks }]]);

    const passages = buildPassages(
      [hit({ chunkIndex: 0, score: 0.9 })],
      documents,
      "section"
    );
    expect(passages[0]?.text).toContain("Escape routes must be kept clear.");
    expect(passages[0]?.heading).toBe("Fire safety");
  });
});

describe("budgetPassages", () => {
  const passage = (text: string, score: number) => ({
    fileId: FILE_ID,
    fileName: "spec.pdf",
    text,
    heading: null,
    pageStart: null,
    pageEnd: null,
    score,
  });

  it("keeps rank order and stops at the budget", () => {
    const kept = budgetPassages(
      [passage("a".repeat(400), 0.9), passage("b".repeat(400), 0.5)],
      120
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]?.score).toBe(0.9);
  });

  it("truncates rather than returning nothing when the best passage alone overflows", () => {
    const kept = budgetPassages([passage("a".repeat(4000), 0.9)], 100);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.text).toHaveLength(400);
  });

  it("skips an oversized passage but keeps a later one that fits", () => {
    const kept = budgetPassages(
      [
        passage("a".repeat(40), 0.9),
        passage("b".repeat(4000), 0.8),
        passage("c", 0.7),
      ],
      100
    );
    expect(kept.map((entry) => entry.score)).toEqual([0.9, 0.7]);
  });

  it("returns nothing for no passages", () => {
    expect(budgetPassages([], 4000)).toEqual([]);
  });
});

describe("formatContext", () => {
  it("numbers passages and locates each by page and heading", () => {
    const { context, sources } = formatContext([
      {
        fileId: FILE_ID,
        fileName: "spec.pdf",
        text: "Escape routes.",
        heading: "Fire safety",
        pageStart: 3,
        pageEnd: 4,
        score: 0.9,
      },
      {
        fileId: FILE_ID,
        fileName: "spec.pdf",
        text: "Widths.",
        heading: null,
        pageStart: 7,
        pageEnd: 7,
        score: 0.5,
      },
    ]);

    expect(context).toContain("[1] spec.pdf (pp.3-4, Fire safety)");
    expect(context).toContain("[2] spec.pdf (p.7)");
    expect(sources.map((source) => source.index)).toEqual([1, 2]);
    expect(sources[0]?.page).toBe(3);
  });

  it("omits the locator entirely when there is nothing to locate by", () => {
    const { context } = formatContext([
      {
        fileId: FILE_ID,
        fileName: "notes.md",
        text: "Body.",
        heading: null,
        pageStart: null,
        pageEnd: null,
        score: 0.4,
      },
    ]);
    expect(context).toBe("[1] notes.md\nBody.");
  });

  it("carries a signed url onto its source when one was attached", () => {
    const { sources } = formatContext([
      {
        fileId: FILE_ID,
        fileName: "notes.md",
        text: "Body.",
        heading: null,
        pageStart: null,
        pageEnd: null,
        score: 0.4,
        url: "https://example.test/signed",
      },
    ]);
    expect(sources[0]?.url).toBe("https://example.test/signed");
  });
});
