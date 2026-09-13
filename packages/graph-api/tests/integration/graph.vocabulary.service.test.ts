import { GraphVocabularyService } from "@aec-craft/platform-graph-api/nest";
import { describe, expect, it } from "vitest";

describe("GraphVocabularyService", () => {
  const fakeOrgId = "00000000-0000-0000-0000-000000000001";

  it("classify increments the counter on experimental values, silent on canonical", () => {
    const vocab = new GraphVocabularyService();
    expect(vocab.getCounters().size).toBe(0);
    vocab.classify("node_type", "experimental_kind", fakeOrgId);
    expect(vocab.getCounters().size).toBe(1);
    // Canonical pass-through: counter does not grow.
    vocab.classify("node_type", "object", fakeOrgId);
    expect(vocab.getCounters().size).toBe(1);
  });

  it("classify never throws (no strict mode)", () => {
    const vocab = new GraphVocabularyService();
    expect(() =>
      vocab.classify("node_type", "anything", fakeOrgId)
    ).not.toThrow();
    expect(() =>
      vocab.classify("edge_type", "anything", fakeOrgId)
    ).not.toThrow();
    expect(() =>
      vocab.classify("class_root", "anything", fakeOrgId)
    ).not.toThrow();
    expect(() =>
      vocab.classify("block_key", "anything", fakeOrgId)
    ).not.toThrow();
  });

  it("classifyBlockKeys iterates each key", () => {
    const vocab = new GraphVocabularyService();
    vocab.classifyBlockKeys({ envelope: {}, weirdBlock: {} }, fakeOrgId);
    const keys = Array.from(vocab.getCounters().keys());
    expect(keys.some((k) => k.startsWith("block_key|weirdBlock|"))).toBe(true);
    // Canonical block keys (`envelope`) do not increment the counter.
    expect(keys.some((k) => k.startsWith("block_key|envelope|"))).toBe(false);
  });

  it("classifyBlockKeys skips when properties is undefined", () => {
    const vocab = new GraphVocabularyService();
    expect(() => vocab.classifyBlockKeys(undefined, fakeOrgId)).not.toThrow();
    expect(vocab.getCounters().size).toBe(0);
  });

  it("classify is silent for canonical values across all four kinds", () => {
    const vocab = new GraphVocabularyService();
    vocab.classify("node_type", "object", fakeOrgId);
    vocab.classify("edge_type", "contains", fakeOrgId);
    vocab.classify("class_root", "space", fakeOrgId);
    vocab.classify("block_key", "envelope", fakeOrgId);
    expect(vocab.getCounters().size).toBe(0);
  });

  it("counter aggregates per (kind, value, orgId)", () => {
    const vocab = new GraphVocabularyService();
    vocab.classify("node_type", "weird", fakeOrgId);
    vocab.classify("node_type", "weird", fakeOrgId);
    vocab.classify("node_type", "weird", fakeOrgId);
    const entry = Array.from(vocab.getCounters().entries()).find(([k]) =>
      k.startsWith("node_type|weird|")
    );
    expect(entry?.[1]).toBe(3);
  });
});
