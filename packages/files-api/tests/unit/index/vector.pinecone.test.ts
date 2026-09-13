import { describe, expect, it, vi } from "vitest";

import type {
  VectorChunk,
  VectorQuery,
} from "../../../src/modules/index/file.index.seams";
import { createPineconeVectorStore } from "../../../src/modules/index/providers/file.vector.pinecone";

const ORG = "org-1";
const PROJECT = "project-1";
const GROUP = "group-1";
const FILE = "file-1";

interface Call {
  body: Record<string, unknown>;
  url: string;
}

/** A fetch stand-in that records calls and replays queued JSON responses. */
function fakeFetch(responses: unknown[] = []) {
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
  return { calls, doFetch: doFetch as unknown as typeof globalThis.fetch };
}

function storeWith(responses: unknown[] = []) {
  const { calls, doFetch } = fakeFetch(responses);
  const store = createPineconeVectorStore({
    apiKey: "key",
    indexHost: "docs-abc.svc.pinecone.io",
    fetch: doFetch,
  });
  return { calls, store };
}

function query(overrides: Partial<VectorQuery> = {}): VectorQuery {
  return {
    embedding: [0.1, 0.2],
    topK: 5,
    orgId: ORG,
    groupIds: [GROUP],
    projectId: PROJECT,
    includeOrgLibrary: true,
    ...overrides,
  };
}

function filterOf(call: Call): Record<string, unknown> {
  return (call.body.filter ?? {}) as Record<string, unknown>;
}

describe("pinecone host normalising", () => {
  async function urlFor(indexHost: string): Promise<string | undefined> {
    const { calls, doFetch } = fakeFetch([{ matches: [] }]);
    const store = createPineconeVectorStore({
      apiKey: "key",
      indexHost,
      fetch: doFetch,
    });
    await store.query(query());
    return calls[0]?.url;
  }

  it("gives a bare host https, which is every hosted index", async () => {
    for (const indexHost of [
      "docs-abc.svc.pinecone.io",
      "https://docs-abc.svc.pinecone.io",
      "https://docs-abc.svc.pinecone.io/",
    ]) {
      expect(await urlFor(indexHost)).toBe(
        "https://docs-abc.svc.pinecone.io/query"
      );
    }
  });

  /** The local emulator serves plain HTTP on a localhost port. */
  it("honours an explicit http scheme, so the emulator uses the same driver", async () => {
    expect(await urlFor("http://localhost:5081")).toBe(
      "http://localhost:5081/query"
    );
    expect(await urlFor("http://localhost:5081/")).toBe(
      "http://localhost:5081/query"
    );
  });
});

describe("pinecone query authorization", () => {
  it("always constrains the readable group set", async () => {
    const { calls, store } = storeWith([{ matches: [] }]);
    await store.query(query({ groupIds: ["a", "b"] }));

    const conditions = filterOf(calls[0] as Call).$and as Record<
      string,
      unknown
    >[];
    expect(conditions).toContainEqual({ groupId: { $in: ["a", "b"] } });
  });

  it("uses the org as the namespace, so one org cannot address another's vectors", async () => {
    const { calls, store } = storeWith([{ matches: [] }]);
    await store.query(query());
    expect(calls[0]?.body.namespace).toBe(ORG);
  });

  it("never sends a query when the caller may read nothing", async () => {
    const { calls, store } = storeWith([{ matches: [] }]);
    const hits = await store.query(query({ groupIds: [] }));
    expect(hits).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("a project search matches the project or the library, never a sibling project", async () => {
    const { calls, store } = storeWith([{ matches: [] }]);
    await store.query(query({ projectId: PROJECT, includeOrgLibrary: true }));

    const conditions = filterOf(calls[0] as Call).$and as Record<
      string,
      unknown
    >[];
    expect(conditions).toContainEqual({
      $or: [{ projectId: { $eq: PROJECT } }, { projectId: { $exists: false } }],
    });
  });

  it("scope=project narrows to the project alone", async () => {
    const { calls, store } = storeWith([{ matches: [] }]);
    await store.query(query({ projectId: PROJECT, includeOrgLibrary: false }));

    const conditions = filterOf(calls[0] as Call).$and as Record<
      string,
      unknown
    >[];
    expect(conditions).toContainEqual({ projectId: { $eq: PROJECT } });
  });

  it("an org search matches only documents with no project", async () => {
    const { calls, store } = storeWith([{ matches: [] }]);
    await store.query(query({ projectId: null }));

    const conditions = filterOf(calls[0] as Call).$and as Record<
      string,
      unknown
    >[];
    expect(conditions).toContainEqual({ projectId: { $exists: false } });
  });

  it("prefixes caller attributes so they cannot shadow the scope fields", async () => {
    const { calls, store } = storeWith([{ matches: [] }]);
    await store.query(
      query({ filter: { groupId: "spoofed", discipline: "structural" } })
    );

    const conditions = filterOf(calls[0] as Call).$and as Record<
      string,
      unknown
    >[];
    expect(conditions).toContainEqual({ attr_groupId: { $eq: "spoofed" } });
    expect(conditions).toContainEqual({
      attr_discipline: { $eq: "structural" },
    });
    // The real group constraint survives untouched.
    expect(conditions).toContainEqual({ groupId: { $in: [GROUP] } });
  });
});

describe("pinecone query results", () => {
  it("maps metadata back onto hits", async () => {
    const { store } = storeWith([
      {
        matches: [
          {
            id: `${FILE}#3`,
            score: 0.82,
            metadata: {
              fileId: FILE,
              fileName: "spec.pdf",
              chunkIndex: 3,
              text: "Escape routes.",
              heading: "Fire safety",
              page: 4,
            },
          },
        ],
      },
    ]);

    const hits = await store.query(query());
    expect(hits).toEqual([
      {
        fileId: FILE,
        fileName: "spec.pdf",
        chunkIndex: 3,
        text: "Escape routes.",
        heading: "Fire safety",
        page: 4,
        score: 0.82,
      },
    ]);
  });

  it("falls back to the vector id when metadata is missing", async () => {
    const { store } = storeWith([
      { matches: [{ id: `${FILE}#7`, score: 0.4 }] },
    ]);
    const [found] = await store.query(query());
    expect(found?.fileId).toBe(FILE);
    expect(found?.chunkIndex).toBe(7);
    expect(found?.heading).toBeNull();
    expect(found?.page).toBeNull();
  });
});

describe("pinecone upsert", () => {
  function chunk(overrides: Partial<VectorChunk> = {}): VectorChunk {
    return {
      index: 0,
      text: "body",
      embeddedText: "Fire safety\n\nbody",
      embedding: [0.1, 0.2],
      fileId: FILE,
      fileName: "spec.pdf",
      scope: { orgId: ORG, projectId: PROJECT, groupId: GROUP },
      attributes: {},
      ...overrides,
    };
  }

  it("deletes the document's existing vectors before writing, so it cannot accumulate", async () => {
    const { calls, store } = storeWith([
      { vectors: [{ id: `${FILE}#0` }, { id: `${FILE}#1` }] },
      {},
      {},
    ]);
    await store.upsertDocument(ORG, FILE, [chunk()]);

    expect(calls[0]?.url).toContain("/vectors/list");
    expect(calls[0]?.url).toContain(`prefix=${FILE}%23`);
    expect(calls[1]?.url).toContain("/vectors/delete");
    expect(calls[1]?.body.ids).toEqual([`${FILE}#0`, `${FILE}#1`]);
    expect(calls[2]?.url).toContain("/vectors/upsert");
  });

  it("stamps the scope onto every vector, which is what the query filters on", async () => {
    const { calls, store } = storeWith([{ vectors: [] }, {}]);
    await store.upsertDocument(ORG, FILE, [
      chunk({ heading: "Fire safety", page: 2 }),
    ]);

    const vectors = calls[1]?.body.vectors as {
      id: string;
      metadata: Record<string, unknown>;
    }[];
    expect(vectors[0]?.id).toBe(`${FILE}#0`);
    expect(vectors[0]?.metadata).toMatchObject({
      fileId: FILE,
      groupId: GROUP,
      projectId: PROJECT,
      heading: "Fire safety",
      page: 2,
    });
  });

  it("leaves projectId absent for an org-library document, since absence is the library", async () => {
    const { calls, store } = storeWith([{ vectors: [] }, {}]);
    await store.upsertDocument(ORG, FILE, [
      chunk({ scope: { orgId: ORG, projectId: null, groupId: GROUP } }),
    ]);

    const vectors = calls[1]?.body.vectors as {
      metadata: Record<string, unknown>;
    }[];
    expect(vectors[0]?.metadata).not.toHaveProperty("projectId");
  });

  it("paginates the id listing before deleting", async () => {
    const { calls, store } = storeWith([
      { vectors: [{ id: `${FILE}#0` }], pagination: { next: "token-2" } },
      { vectors: [{ id: `${FILE}#1` }] },
      {},
      {},
    ]);
    await store.deleteDocument(ORG, FILE);

    expect(calls[1]?.url).toContain("paginationToken=token-2");
    expect(calls[2]?.body.ids).toEqual([`${FILE}#0`, `${FILE}#1`]);
  });

  it("does not call delete when the document has no vectors", async () => {
    const { calls, store } = storeWith([{ vectors: [] }]);
    await store.deleteDocument(ORG, FILE);
    expect(calls).toHaveLength(1);
  });
});
