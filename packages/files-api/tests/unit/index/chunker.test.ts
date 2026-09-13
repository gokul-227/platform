import { describe, expect, it } from "vitest";

import {
  approxTokens,
  createFixedChunker,
  createStructureChunker,
} from "../../../src/modules/index/chunker";

const structure = createStructureChunker();

describe("structure chunker", () => {
  it("carries the heading path and cuts where headings change", () => {
    const chunks = structure.chunk(
      [
        "# Fire safety",
        "Escape routes must be kept clear.",
        "## Escape routes",
        "Minimum width is 1.2 m.",
      ].join("\n\n")
    );

    expect(chunks.map((chunk) => chunk.heading)).toEqual([
      "Fire safety",
      "Fire safety > Escape routes",
    ]);
    expect(chunks[0]?.text).toBe("Escape routes must be kept clear.");
    expect(chunks[1]?.text).toBe("Minimum width is 1.2 m.");
  });

  it("pops the heading path when a shallower heading follows a deeper one", () => {
    const chunks = structure.chunk(
      ["# A", "## B", "under b", "# C", "under c"].join("\n\n")
    );
    expect(chunks.map((chunk) => chunk.heading)).toEqual(["A > B", "C"]);
  });

  it("indexes chunks contiguously from zero, which passage expansion relies on", () => {
    const chunks = structure.chunk(
      ["# One", "a", "# Two", "b", "# Three", "c"].join("\n\n")
    );
    expect(chunks.map((chunk) => chunk.index)).toEqual([0, 1, 2]);
  });

  it("size-caps an oversized section and overlaps only at the forced split", () => {
    const sentence = "the quick brown fox jumps over the lazy dog. ";
    const chunks = structure.chunk(`# Long\n\n${sentence.repeat(60)}`, {
      maxTokens: 64,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.heading).toBe("Long");
      // 64 tokens is ~256 chars; allow the sentence-boundary search its slack.
      expect(chunk.text.length).toBeLessThanOrEqual(300);
    }
    // Overlap means the tail of one chunk reappears at the head of the next.
    const firstTail = (chunks[0] as { text: string }).text.slice(-20);
    expect((chunks[1] as { text: string }).text).toContain(firstTail.trim());
  });

  it("assigns each chunk the page it starts on, and strips the markers", () => {
    const chunks = structure.chunk(
      [
        "# One",
        "<!-- page:1 -->",
        "First page body.",
        "# Two",
        "<!-- page:2 -->",
        "Second page body.",
      ].join("\n\n")
    );

    expect(chunks.map((chunk) => chunk.page)).toEqual([1, 2]);
    for (const chunk of chunks) {
      expect(chunk.text).not.toContain("page:");
    }
  });

  /**
   * A page break is not a chunk boundary: a sentence may straddle one, and
   * cutting there would split it. A chunk that spans pages reports the page it
   * began on, and the full range is recovered per passage at retrieval.
   */
  it("does not break a chunk at a page boundary", () => {
    const chunks = structure.chunk(
      [
        "<!-- page:1 -->",
        "First page body.",
        "<!-- page:2 -->",
        "Second page body.",
      ].join("\n\n")
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.page).toBe(1);
    expect(chunks[0]?.text).toBe("First page body.\n\nSecond page body.");
  });

  it("is deterministic, which is what makes expansion reconstruct the same chunks", () => {
    const markdown = ["# A", "one", "## B", "two", "three"].join("\n\n");
    expect(structure.chunk(markdown)).toEqual(structure.chunk(markdown));
  });

  it("drops a heading that has no body of its own", () => {
    const chunks = structure.chunk("# Only a heading");
    expect(chunks).toEqual([]);
  });

  it("routes to the fixed chunker when asked", () => {
    const markdown = ["# A", "one", "## B", "two"].join("\n\n");
    expect(structure.chunk(markdown, { strategy: "fixed" })).toEqual(
      createFixedChunker().chunk(markdown, { strategy: "fixed" })
    );
  });
});

describe("structure chunker: tables", () => {
  const header = "| Door | Width (mm) | Fire rating |";
  const separator = "| --- | --- | --- |";
  const rowFor = (n: number): string => `| D-${100 + n} | 926 | FD30 |`;

  it("splits an oversized table at row boundaries and repeats the header", () => {
    const rows = Array.from({ length: 60 }, (_, n) => rowFor(n));
    const table = [header, separator, ...rows].join("\n");
    const chunks = structure.chunk(`# Door schedule\n\n${table}`, {
      maxTokens: 64,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const lines = chunk.text.split("\n");
      expect(lines[0]).toBe(header);
      expect(lines[1]).toBe(separator);
      expect(chunk.heading).toBe("Door schedule");
    }
    // Every row lands in exactly one chunk, in order, none lost to overlap.
    const emitted = chunks.flatMap((chunk) => chunk.text.split("\n").slice(2));
    expect(emitted).toEqual(rows);
  });

  it("leaves a table that fits within the cap untouched", () => {
    const table = [header, separator, rowFor(1)].join("\n");
    const chunks = structure.chunk(table);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(table);
  });

  it("keeps the page a split table started on", () => {
    const rows = Array.from({ length: 60 }, (_, n) => rowFor(n));
    const table = [header, separator, ...rows].join("\n");
    const chunks = structure.chunk(`<!-- page:3 -->\n\n${table}`, {
      maxTokens: 64,
    });
    for (const chunk of chunks) {
      expect(chunk.page).toBe(3);
    }
  });

  it("still sentence-splits oversized prose that merely contains pipes", () => {
    const prose = "either a | or a b applies here. ".repeat(30);
    const chunks = structure.chunk(prose, { maxTokens: 64 });
    expect(chunks.length).toBeGreaterThan(1);
    // Prose windows overlap; a table split would never duplicate content.
    const firstTail = (chunks[0] as { text: string }).text.slice(-15);
    expect((chunks[1] as { text: string }).text).toContain(firstTail.trim());
  });
});

describe("fixed chunker", () => {
  it("windows the whole document and ignores headings", () => {
    const chunks = createFixedChunker().chunk(
      `# Heading\n\n${"word ".repeat(400)}`,
      { maxTokens: 64 }
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk).not.toHaveProperty("heading");
    }
  });

  it("still resolves the page a window started on", () => {
    const chunks = createFixedChunker().chunk(
      `<!-- page:7 -->\n\n${"word ".repeat(20)}`,
      { maxTokens: 512 }
    );
    expect(chunks[0]?.page).toBe(7);
  });
});

describe("approxTokens", () => {
  it("counts four characters to the token, rounding up", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("abc")).toBe(1);
    expect(approxTokens("abcd")).toBe(1);
    expect(approxTokens("abcde")).toBe(2);
  });
});
