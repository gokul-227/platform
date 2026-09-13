import { describe, expect, it, vi } from "vitest";

import type {
  LexicalChunk,
  LexicalQuery,
} from "../../../src/modules/index/file.index.seams";
import { createPineconeLexicalStore } from "../../../src/modules/index/providers/file.lexical.pinecone";

const ORG = "org-1";
const FILE = "file-1";

interface Call {
  body: Record<string, unknown>;
  url: string;
}

function storeWith(responses: unknown[] = []) {
  const calls: Call[] = [];
  const queue = [...responses];
  const doFetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    return {
      ok: true,
      status: 200,
      json: async () => queue.shift() ?? {},
      text: async () => "",
    } as unknown as Response;
  });
  const store = createPineconeLexicalStore({
    apiKey: "key",
    indexHost: "http://localhost:5082",
    fetch: doFetch as unknown as typeof globalThis.fetch,
  });
  return { calls, store };
}

function query(overrides: Partial<LexicalQuery> = {}): LexicalQuery {
  return {
    query: "escape route width",
    topK: 5,
    orgId: ORG,
    groupIds: ["group-1"],
    projectId: "project-1",
    includeOrgLibrary: true,
    ...overrides,
  };
}

function chunk(overrides: Partial<LexicalChunk> = {}): LexicalChunk {
  return {
    index: 0,
    text: "Design to EN 1992-1-1.",
    indexedText: "Fire safety\n\nDesign to EN 1992-1-1.",
    fileId: FILE,
    fileName: "spec.pdf",
    scope: { orgId: ORG, projectId: "project-1", groupId: "group-1" },
    attributes: { discipline: "structural" },
    ...overrides,
  };
}

describe("pinecone lexical upsert", () => {
  it("sends sparseValues and no dense vector, which a sparse index requires", async () => {
    const { calls, store } = storeWith([{ vectors: [] }, {}]);
    await store.upsertDocument(ORG, FILE, [chunk()]);

    const vectors = calls[1]?.body.vectors as Record<string, unknown>[];
    // The store encodes the text itself, so the weights are its business; what
    // matters here is that a sparse vector is sent and a dense one is not.
    const sparse = vectors[0]?.sparseValues as {
      indices: number[];
      values: number[];
    };
    expect(sparse.indices.length).toBeGreaterThan(0);
    expect(sparse.values).toHaveLength(sparse.indices.length);
    expect(vectors[0]).not.toHaveProperty("values");
  });

  it("uses the same vector ids as the dense index, which is what makes fusion work", async () => {
    const { calls, store } = storeWith([{ vectors: [] }, {}]);
    await store.upsertDocument(ORG, FILE, [chunk({ index: 7 })]);

    const vectors = calls[1]?.body.vectors as { id: string }[];
    expect(vectors[0]?.id).toBe(`${FILE}#7`);
  });

  it("carries the same scope metadata the dense index filters on", async () => {
    const { calls, store } = storeWith([{ vectors: [] }, {}]);
    await store.upsertDocument(ORG, FILE, [chunk()]);

    const vectors = calls[1]?.body.vectors as {
      metadata: Record<string, unknown>;
    }[];
    expect(vectors[0]?.metadata).toMatchObject({
      fileId: FILE,
      groupId: "group-1",
      projectId: "project-1",
      attr_discipline: "structural",
    });
  });

  it("replaces existing vectors before writing", async () => {
    const { calls, store } = storeWith([
      { vectors: [{ id: `${FILE}#0` }] },
      {},
      {},
    ]);
    await store.upsertDocument(ORG, FILE, [chunk()]);
    expect(calls[0]?.url).toContain("/vectors/list");
    expect(calls[1]?.url).toContain("/vectors/delete");
    expect(calls[2]?.url).toContain("/vectors/upsert");
  });
});

describe("pinecone lexical query", () => {
  it("applies the same access filter as the dense store", async () => {
    const { calls, store } = storeWith([{ matches: [] }]);
    await store.query(query());

    const conditions = (calls[0]?.body.filter as { $and: unknown[] })
      .$and as Record<string, unknown>[];
    expect(conditions).toContainEqual({ groupId: { $in: ["group-1"] } });
    expect(conditions).toContainEqual({
      $or: [
        { projectId: { $eq: "project-1" } },
        { projectId: { $exists: false } },
      ],
    });
  });

  it("never leaves when the caller may read nothing", async () => {
    const { calls, store } = storeWith([{ matches: [] }]);
    expect(await store.query(query({ groupIds: [] }))).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  /** A query of nothing but stopwords encodes to no terms to rank against. */
  it("never leaves when the query encoded to no terms", async () => {
    const { calls, store } = storeWith([{ matches: [] }]);
    expect(await store.query(query({ query: "the and of" }))).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  /**
   * A sparse index scores everything the filter admits, including documents
   * sharing no term with the query. Those are not lexical matches and must not
   * take a slot in the fusion.
   */
  it("drops zero-score matches", async () => {
    const { store } = storeWith([
      {
        matches: [
          {
            id: `${FILE}#0`,
            score: 2.3,
            metadata: { fileId: FILE, fileName: "spec.pdf", chunkIndex: 0 },
          },
          {
            id: "other#0",
            score: 0,
            metadata: { fileId: "other", fileName: "x.pdf", chunkIndex: 0 },
          },
        ],
      },
    ]);
    const hits = await store.query(query());
    expect(hits.map((hit) => hit.fileId)).toEqual([FILE]);
  });

  it("maps a match back to the same hit shape the dense store returns", async () => {
    const { store } = storeWith([
      {
        matches: [
          {
            id: `${FILE}#3`,
            score: 2.3,
            metadata: {
              fileId: FILE,
              fileName: "spec.pdf",
              chunkIndex: 3,
              text: "Design to EN 1992-1-1.",
              heading: "Concrete",
              page: 12,
            },
          },
        ],
      },
    ]);
    expect(await store.query(query())).toEqual([
      {
        fileId: FILE,
        fileName: "spec.pdf",
        chunkIndex: 3,
        text: "Design to EN 1992-1-1.",
        heading: "Concrete",
        page: 12,
        score: 2.3,
      },
    ]);
  });
});
