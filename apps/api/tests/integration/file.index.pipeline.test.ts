import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { AuditWriter } from "@aec-craft/platform-audit-api";
import type {
  ResolvedScope,
  SearchFilesResponse,
} from "@aec-craft/platform-contracts";
import {
  type ConfigInput,
  type FileStorage,
  parseConfig,
} from "@aec-craft/platform-files-api";
import {
  createFileIndexDeps,
  FileIndexPipelineStep,
  FileIndexService,
  FilePipelineSettler,
  FileService,
} from "@aec-craft/platform-files-api/nest";
import {
  buildServices,
  dbAvailable,
  makeOrg,
  makeProject,
  makeUser,
  orgScope,
  projectScope,
  useTestDb,
} from "@aec-craft/platform-testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PlatformRunFilesSource } from "../../src/run-files.source";

/**
 * The document-index pipeline end to end against real infrastructure: Postgres,
 * a vector index, and a real embedding model. What it proves is the chain no
 * unit test can — that an upload completed under a preset naming the `index`
 * step becomes searchable without anybody calling the index directly, and that
 * a query only reaches documents the caller's groups and partition allow.
 *
 * Storage is a local HTTP server rather than a bucket. Ingestion's only demand
 * on storage is a URL it can fetch, and the bucket protocol is already covered
 * by the upload suite; standing up a real bucket here would test GCS signing,
 * not indexing.
 *
 * Requires PINECONE_API_KEY + PINECONE_INDEX_HOST (the local emulator is
 * enough: `pnpm --filter @aec-craft/platform-files-api db:index:up && ... db:index:init`)
 * and Vertex credentials. Skips without them, so it never fails a CI run that
 * has no index.
 *
 * Prefer the emulator. Every case creates a throwaway org, the namespace is the
 * org, and Postgres is truncated between cases while a vector index is not, so a
 * run against a real index leaves a namespace of orphaned vectors per case behind.
 */

/** Long enough for a serverless index's delete to become visible to a query. */
const SETTLE_ATTEMPTS = 20;
const SETTLE_INTERVAL_MS = 500;

/**
 * One file's hits, read again until the vector store reflects the last write.
 *
 * A serverless index acknowledges a delete one to two seconds before a query
 * stops returning what it removed, so any assertion about what is gone (a
 * de-index, a purge, the tail of a shortened document) has to let it settle.
 * The local emulator is synchronous and settles on the first read, which is why
 * this only shows up against a real index.
 */
async function hitsForFileWhenSettled(
  index: FileIndexService,
  scope: ResolvedScope,
  readable: string[],
  input: { query: string; topK: number },
  fileId: string,
  expected: number
): Promise<SearchFilesResponse["hits"]> {
  let mine: SearchFilesResponse["hits"] = [];
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    const { hits } = await index.search(scope, readable, input);
    mine = hits.filter((entry) => entry.fileId === fileId);
    if (mine.length === expected) {
      return mine;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, SETTLE_INTERVAL_MS);
    });
  }
  return mine;
}

const hasIndex = Boolean(
  process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_HOST
);
// Postgres full-text search needs nothing beyond the database the suite
// already has, so the lexical half is always exercised. Setting the sparse host
// runs the same assertions against a Pinecone sparse index instead.
const hasLexical = true;

const SPEC = `# Fire safety

Every escape route shall have a clear width of not less than 1.2 m.

## Escape routes

Escape routes must be kept clear of obstructions at all times, and doors on an
escape route must not be lockable from the side people escape towards.

Where an escape route passes through a lobby, the lobby shall be ventilated and
shall not be used for storage of any kind.

Signage on an escape route shall be illuminated and legible from 30 m.

## Smoke control

Stairwells serving more than four storeys require mechanical smoke extraction.

# Acoustics

Party walls between dwellings shall achieve a weighted sound reduction index of
at least 53 dB.

## Impact sound

Floor assemblies between dwellings shall not exceed 58 dB impact sound
pressure level.
`;

/** Bytes served over real HTTP, which is what the ingestion path fetches. */
function objectServer(): {
  close: () => Promise<void>;
  drop: (key: string) => void;
  put: (key: string, body: string) => void;
  server: Server;
  sizeOf: (key: string) => number | null;
  urlFor: (key: string) => string;
} {
  const objects = new Map<string, string>();
  const server = createServer((req, res) => {
    const key = decodeURIComponent((req.url ?? "/").replace(/^\/+/, ""));
    const body = objects.get(key);
    if (body === undefined) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("content-type", "text/markdown");
    res.end(body);
  });
  return {
    server,
    put: (key, body) => objects.set(key, body),
    /** What the bucket would report for an object it holds. */
    sizeOf: (key) => objects.get(key)?.length ?? null,
    drop: (key) => objects.delete(key),
    urlFor: (key) => {
      const { port } = server.address() as AddressInfo;
      return `http://127.0.0.1:${port}/${encodeURIComponent(key)}`;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

const STANDARDS = `# Concrete

Design concrete structures to EN 1992-1-1, including nominal cover for exposure
class XC3 and the durability provisions that follow from it.

# Steel

Design steel structures to EN 1993-1-1, including the buckling verification for
slender members.
`;

describe.skipIf(!(dbAvailable() && hasIndex))(
  "Document index pipeline (integration)",
  () => {
    const ctx = useTestDb();
    const objects = objectServer();

    beforeAll(async () => {
      await new Promise<void>((resolve) => {
        objects.server.listen(0, "127.0.0.1", () => resolve());
      });
    });

    afterAll(async () => {
      await objects.close();
    });

    function config(): ConfigInput {
      return {
        databaseUrl: "postgres://unused",
        fileStorage: { provider: "gcs", bucket: "unused" },
        documentIndex: {
          vectorStore: {
            provider: "pinecone",
            apiKey: process.env.PINECONE_API_KEY as string,
            indexHost: process.env.PINECONE_INDEX_HOST as string,
          },
          lexicalStore: process.env.PINECONE_SPARSE_INDEX_HOST
            ? {
                provider: "pinecone" as const,
                indexHost: process.env.PINECONE_SPARSE_INDEX_HOST,
              }
            : { provider: "postgres" as const },
          // `ask` needs an answer model; the other three rungs do not.
          answerer: { provider: "vertex" as const },
          embedder: {
            provider: "vertex",
            ...(process.env.VERTEX_PROJECT_ID
              ? { projectId: process.env.VERTEX_PROJECT_ID }
              : {}),
            ...(process.env.RAG_DIMENSIONS
              ? { dimensions: Number(process.env.RAG_DIMENSIONS) }
              : {}),
          },
        },
        presets: [
          {
            name: "default",
            maxFileSizeBytes: 5 * 1024 ** 3,
            acceptedContentTypes: null,
            pipeline: [],
          },
          {
            name: "document",
            maxFileSizeBytes: 200 * 1024 ** 2,
            acceptedContentTypes: ["text/markdown"],
            pipeline: ["index"],
            index: { attributes: { discipline: "architecture" } },
          },
        ],
      };
    }

    /** Storage whose only real behaviour is handing back a fetchable URL. */
    function storage(): FileStorage {
      return {
        available: true,
        createUpload: (args) =>
          Promise.resolve({
            target: {
              type: "put",
              url: objects.urlFor(args.key),
              method: "PUT",
              headers: {},
              expiresAt: new Date(Date.now() + 3_600_000),
            },
            coords: {
              strategy: "put",
              sessionUrl: null,
              multipartUploadId: null,
              partSizeBytes: null,
            },
          }),
        refreshUpload: (args) =>
          Promise.resolve({
            type: "put",
            url: objects.urlFor(args.key),
            method: "PUT",
            headers: {},
            expiresAt: new Date(Date.now() + 3_600_000),
          }),
        createDownloadTarget: (key) =>
          Promise.resolve({
            url: objects.urlFor(key),
            expiresAt: new Date(Date.now() + 3_600_000),
          }),
        // Size comes from what was actually stored, which is what a bucket
        // reports and what `complete` verifies the declaration against.
        head: (key) =>
          Promise.resolve({
            exists: objects.sizeOf(key) !== null,
            size: objects.sizeOf(key),
            checksum: null,
          }),
        finalizeUpload: (key) =>
          Promise.resolve({
            exists: objects.sizeOf(key) !== null,
            size: objects.sizeOf(key),
            checksum: null,
          }),
        cancelUpload: () => Promise.resolve(),
        remove: () => Promise.resolve(),
      };
    }

    function servicesFor(): { files: FileService; index: FileIndexService } {
      const parsed = parseConfig(config());
      const store = storage();
      const index = new FileIndexService(
        ctx.filesDb,
        store,
        parsed,
        createFileIndexDeps(parsed, ctx.filesDb),
        new FilePipelineSettler(ctx.filesDb)
      );
      const files = new FileService(
        ctx.filesDb,
        store,
        parsed,
        new AuditWriter(),
        [new FileIndexPipelineStep(index, parsed)],
        index
      );
      return { files, index };
    }

    /** An org with one project, and the two scopes over it. */
    async function scopes(): Promise<{
      org: ResolvedScope;
      project: ResolvedScope;
      readable: string[];
    }> {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);
      const orgContext = await orgScope(services, org.id);
      const projectContext = await projectScope(services, project.id);
      return {
        org: orgContext,
        project: projectContext,
        readable: [orgContext.groupId, projectContext.groupId],
      };
    }

    /**
     * Create, put the bytes where storage points, complete. Completion is what
     * fires the preset's pipeline, so nothing here touches the index directly.
     */
    async function uploadDocument(
      files: FileService,
      scope: ResolvedScope,
      name: string,
      body: string,
      preset: string
    ): Promise<string> {
      const created = await files.create(
        scope,
        {
          groupId: scope.groupId,
          type: "file",
          name,
          contentType: "text/markdown",
          size: body.length,
          preset,
        },
        null
      );
      const fileId = created.file.id;
      // The client's PUT, as far as this test is concerned.
      objects.put(`${scope.orgId}/${scope.projectId ?? "org"}/${fileId}`, body);
      await files.complete(scope, fileId, {});
      return fileId;
    }

    it("indexes a document the preset asked for, and finds it by meaning", async () => {
      const { files, index } = servicesFor();
      const { project, readable } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "fire-spec.md",
        SPEC,
        "document"
      );

      // Completing enqueued it: pending before the worker has run.
      const queued = await index.getState(project, fileId);
      expect(queued.status).toBe("pending");
      expect(queued.isIndexed).toBe(false);

      const processed = await index.ingestPending();
      expect(processed).toBe(1);

      const indexed = await index.getState(project, fileId);
      expect(indexed.status).toBe("indexed");
      expect(indexed.isIndexed).toBe(true);
      expect(indexed.chunkCount).toBeGreaterThan(1);
      expect(indexed.error).toBeNull();

      // Wording that appears nowhere in the document: this is the embedding
      // model matching meaning, not a substring.
      const { hits } = await index.search(project, readable, {
        query: "how wide must a fire exit corridor be",
        topK: 3,
      });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.fileId).toBe(fileId);
      expect(hits[0]?.text).toContain("1.2 m");
      expect(hits[0]?.heading).toContain("Fire safety");
      // No threshold: with hybrid as the default this is a rank-fusion
      // aggregate, not a similarity. Its scale is a function of `mode`.
      expect(hits[0]?.score).toBeGreaterThan(0);

      // On the semantic ranking alone the number is a cosine similarity again.
      const semantic = await index.search(project, readable, {
        query: "how wide must a fire exit corridor be",
        mode: "semantic",
        topK: 1,
      });
      expect(semantic.hits[0]?.score).toBeGreaterThan(0.4);

      // A different question reaches a different part of the same document.
      const acoustics = await index.search(project, readable, {
        query: "sound insulation between apartments",
        topK: 3,
      });
      expect(acoustics.hits[0]?.heading).toContain("Acoustics");
      expect(acoustics.hits[0]?.text).toContain("53 dB");
    });

    it("does not index a document uploaded under a preset that asks for nothing", async () => {
      const { files, index } = servicesFor();
      const { project } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "notes.md",
        SPEC,
        "default"
      );

      await expect(index.getState(project, fileId)).rejects.toThrow(
        /FILE_INDEX_NOT_INDEXED|not indexed/i
      );
      expect(await index.ingestPending()).toBe(0);
    });

    /**
     * Expansion turns a matched chunk into readable context.
     *
     * `neighbors` always widens. `section` widens only within the heading the
     * hit sits under, and only when that heading produced more than one chunk:
     * paragraphs sharing a heading are merged while they fit, so a small section
     * is already one chunk. The chunking override here forces the split, which
     * is the case `section` exists for.
     */
    it("expands a hit into the surrounding chunks and the surrounding section", async () => {
      const { files, index } = servicesFor();
      const { project, readable } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "spec.md",
        SPEC,
        "document"
      );
      await index.submit(project, fileId, { chunking: { maxTokens: 64 } });
      await index.ingestPending();

      const query = "may a door on an escape route be locked";
      const lengthOf = async (
        expand: "none" | "neighbors" | "section"
      ): Promise<number> => {
        const { passages } = await index.retrieve(project, readable, {
          query,
          expand,
          topK: 1,
        });
        return passages[0]?.text.length ?? 0;
      };

      const none = await lengthOf("none");
      expect(none).toBeGreaterThan(0);
      expect(await lengthOf("neighbors")).toBeGreaterThan(none);
      expect(await lengthOf("section")).toBeGreaterThan(none);
    });

    /**
     * The other half of the same rule: a heading holding one paragraph has no
     * section to widen into, and expansion returns the chunk unchanged rather
     * than reaching into the next heading's text.
     */
    it("does not expand a section past the heading it belongs to", async () => {
      const { files, index } = servicesFor();
      const { project, readable } = await scopes();

      await uploadDocument(
        files,
        project,
        "one-per-heading.md",
        "# Alpha\n\nOnly paragraph of alpha.\n\n# Beta\n\nOnly paragraph of beta.\n",
        "document"
      );
      await index.ingestPending();

      const { passages } = await index.retrieve(project, readable, {
        query: "alpha",
        expand: "section",
        topK: 1,
      });
      expect(passages[0]?.text).toBe("Only paragraph of alpha.");
      expect(passages[0]?.text).not.toContain("beta");
    });

    it("formats retrieval into numbered context with resolvable sources", async () => {
      const { files, index } = servicesFor();
      const { project, readable } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "spec.md",
        SPEC,
        "document"
      );
      await index.ingestPending();

      const { context, sources } = await index.context(project, readable, {
        query: "escape route width",
        topK: 2,
      });

      expect(context).toContain("[1] spec.md");
      expect(sources[0]?.index).toBe(1);
      expect(sources[0]?.fileId).toBe(fileId);
    });

    it("keeps one project's documents out of another project's search", async () => {
      const { files, index } = servicesFor();
      const first = await scopes();
      const second = await scopes();

      const fileId = await uploadDocument(
        files,
        first.project,
        "spec.md",
        SPEC,
        "document"
      );
      await index.ingestPending();

      // The owning project finds it.
      const owner = await index.search(first.project, first.readable, {
        query: "escape route width",
        topK: 5,
      });
      expect(owner.hits.map((entry) => entry.fileId)).toContain(fileId);

      // A different org's project, with its own readable groups, does not.
      const other = await index.search(second.project, second.readable, {
        query: "escape route width",
        topK: 5,
      });
      expect(other.hits).toHaveLength(0);
    });

    it("a caller who can read nothing gets nothing", async () => {
      const { files, index } = servicesFor();
      const { project } = await scopes();

      await uploadDocument(files, project, "spec.md", SPEC, "document");
      await index.ingestPending();

      const { hits } = await index.search(project, [], {
        query: "escape route width",
        topK: 5,
      });
      expect(hits).toHaveLength(0);
    });

    it("re-indexing replaces a document's chunks rather than adding to them", async () => {
      const { files, index } = servicesFor();
      const { project, readable } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "spec.md",
        SPEC,
        "document"
      );
      await index.ingestPending();
      const first = await index.getState(project, fileId);

      // Same file, shorter text, submitted again.
      objects.put(
        `${project.orgId}/${project.projectId ?? "org"}/${fileId}`,
        "# Fire safety\n\nEscape routes shall be 1.5 m wide.\n"
      );
      await index.submit(project, fileId);
      await index.ingestPending();

      const second = await index.getState(project, fileId);
      expect(second.chunkCount).toBeLessThan(first.chunkCount as number);

      const mine = await hitsForFileWhenSettled(
        index,
        project,
        readable,
        { query: "escape route width", topK: 10 },
        fileId,
        second.chunkCount as number
      );
      expect(mine).toHaveLength(second.chunkCount as number);
      expect(mine[0]?.text).toContain("1.5 m");
    });

    it("de-indexing makes a document unsearchable without deleting it", async () => {
      const { files, index } = servicesFor();
      const { project, readable } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "spec.md",
        SPEC,
        "document"
      );
      await index.ingestPending();
      await index.remove(project, fileId);

      const mine = await hitsForFileWhenSettled(
        index,
        project,
        readable,
        { query: "escape route width", topK: 5 },
        fileId,
        0
      );
      expect(mine).toHaveLength(0);
      // The file itself is untouched.
      expect((await files.findById(project, fileId)).id).toBe(fileId);
    });

    it("deleting a file purges its vectors and clears the tombstone", async () => {
      const { files, index } = servicesFor();
      const { project, readable } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "spec.md",
        SPEC,
        "document"
      );
      await index.ingestPending();
      await files.delete(project, fileId);

      const mine = await hitsForFileWhenSettled(
        index,
        project,
        readable,
        { query: "escape route width", topK: 5 },
        fileId,
        0
      );
      expect(mine).toHaveLength(0);
      // The purge succeeded, so nothing is owed.
      expect(await index.retryPurges()).toBe(0);
    });

    /**
     * A document the worker cannot fetch fails on its own row rather than
     * throwing, so one unreadable file in a batch does not stop the others.
     */
    it("records the reason on the row when a document cannot be read", async () => {
      const { files, index } = servicesFor();
      const { project } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "vanishes.md",
        SPEC,
        "document"
      );
      // The upload confirmed, then the object went away before ingestion.
      objects.drop(`${project.orgId}/${project.projectId ?? "org"}/${fileId}`);
      expect(await index.ingestPending()).toBe(1);

      // The first failure queues one automatic retry rather than giving up.
      const retrying = await index.getState(project, fileId);
      expect(retrying.status).toBe("pending");
      expect(retrying.error).toContain("404");

      // The retry fails too; now the row carries the verdict.
      expect(await index.ingestPending()).toBe(1);
      const state = await index.getState(project, fileId);
      expect(state.status).toBe("failed");
      expect(state.error).toContain("404");
      expect(state.isIndexed).toBe(false);

      // A later pass over a batch is unaffected: it claims only `pending` rows.
      expect(await index.ingestPending()).toBe(0);
    });

    /**
     * The case the lexical half exists for. Two paragraphs differ by one
     * character in a standard number, which is the kind of distinction an
     * embedding flattens; term matching keeps them apart.
     */
    it.skipIf(!hasLexical)(
      "finds an exact standard number that semantic matching confuses",
      async () => {
        const { files, index } = servicesFor();
        const { project, readable } = await scopes();

        const fileId = await uploadDocument(
          files,
          project,
          "standards.md",
          STANDARDS,
          "document"
        );
        await index.ingestPending();

        const headingFor = async (
          mode: "semantic" | "lexical" | "hybrid"
        ): Promise<string | null | undefined> => {
          const { hits } = await index.search(project, readable, {
            query: "EN 1992-1-1",
            mode,
            topK: 1,
          });
          expect(hits[0]?.fileId).toBe(fileId);
          return hits[0]?.heading;
        };

        // Lexical is exact: the chunk citing 1992-1-1 wins, not the one citing
        // 1993-1-1.
        expect(await headingFor("lexical")).toBe("Concrete");
        // And hybrid keeps that, because agreement or a strong single ranking
        // both surface it.
        expect(await headingFor("hybrid")).toBe("Concrete");
        // Semantic is recorded rather than asserted: whether an embedding can
        // separate these two is a property of the model, not of this code.
        await headingFor("semantic");
      }
    );

    it.skipIf(!hasLexical)(
      "hybrid still answers a paraphrase, which lexical alone cannot",
      async () => {
        const { files, index } = servicesFor();
        const { project, readable } = await scopes();

        await uploadDocument(files, project, "spec.md", SPEC, "document");
        await index.ingestPending();

        // Chosen to share no term with the document, not even via a heading:
        // the chunk indexed under "Fire safety" carries those words too, so a
        // query mentioning "fire" would match lexically for the wrong reason.
        const query = "how spacious should a passageway be";
        const hybrid = await index.search(project, readable, {
          query,
          mode: "hybrid",
          topK: 3,
        });
        expect(hybrid.hits[0]?.text).toContain("1.2 m");

        const lexical = await index.search(project, readable, {
          query,
          mode: "lexical",
          topK: 3,
        });
        expect(lexical.hits).toEqual([]);
      }
    );

    it.skipIf(!hasLexical)(
      "de-indexing and deleting clear both indexes, not just the dense one",
      async () => {
        const { files, index } = servicesFor();
        const { project, readable } = await scopes();

        const removed = await uploadDocument(
          files,
          project,
          "removed.md",
          STANDARDS,
          "document"
        );
        await index.ingestPending();
        await index.remove(project, removed);

        const afterRemove = await index.search(project, readable, {
          query: "EN 1992-1-1",
          mode: "lexical",
          topK: 5,
        });
        expect(afterRemove.hits.map((hit) => hit.fileId)).not.toContain(
          removed
        );

        const deleted = await uploadDocument(
          files,
          project,
          "deleted.md",
          STANDARDS,
          "document"
        );
        await index.ingestPending();
        await files.delete(project, deleted);

        const afterDelete = await index.search(project, readable, {
          query: "EN 1992-1-1",
          mode: "lexical",
          topK: 5,
        });
        expect(afterDelete.hits.map((hit) => hit.fileId)).not.toContain(
          deleted
        );
        expect(await index.retryPurges()).toBe(0);
      }
    );

    it.skipIf(!hasLexical)(
      "a lexical query of nothing but stopwords finds nothing",
      async () => {
        const { files, index } = servicesFor();
        const { project, readable } = await scopes();

        await uploadDocument(files, project, "spec.md", SPEC, "document");
        await index.ingestPending();

        const { hits } = await index.search(project, readable, {
          query: "the and of to",
          mode: "lexical",
          topK: 5,
        });
        expect(hits).toEqual([]);
      }
    );

    it.skipIf(!hasLexical)(
      "the group filter holds on the lexical index too",
      async () => {
        const { files, index } = servicesFor();
        const { project, readable } = await scopes();

        await uploadDocument(
          files,
          project,
          "standards.md",
          STANDARDS,
          "document"
        );
        await index.ingestPending();

        expect(
          (
            await index.search(project, readable, {
              query: "EN 1992-1-1",
              mode: "lexical",
              topK: 5,
            })
          ).hits.length
        ).toBeGreaterThan(0);
        expect(
          (
            await index.search(project, [], {
              query: "EN 1992-1-1",
              mode: "lexical",
              topK: 5,
            })
          ).hits
        ).toEqual([]);
      }
    );

    /**
     * The routing property, and the reason the preset is not a button: an
     * uploader that names nothing still gets its document indexed, because the
     * content type decides. A client should not have to know that this
     * deployment indexes markdown in order for its markdown to be indexed.
     */
    it("routes an upload that names no preset by its content type", async () => {
      const { files, index } = servicesFor();
      const { project, readable } = await scopes();

      const created = await files.create(
        project,
        {
          groupId: project.groupId,
          type: "file",
          name: "unnamed.md",
          contentType: "text/markdown",
          size: SPEC.length,
          // No `preset`.
        },
        null
      );
      const fileId = created.file.id;
      objects.put(
        `${project.orgId}/${project.projectId ?? "org"}/${fileId}`,
        SPEC
      );
      await files.complete(project, fileId, {});

      // `document` accepts text/markdown, so completion queued it.
      expect((await index.getState(project, fileId)).status).toBe("pending");
      expect(await index.ingestPending()).toBe(1);
      expect((await index.getState(project, fileId)).isIndexed).toBe(true);

      const { hits } = await index.search(project, readable, {
        query: "how wide must a fire exit corridor be",
        topK: 1,
      });
      expect(hits[0]?.fileId).toBe(fileId);
      expect(hits[0]?.text).toContain("1.2 m");
    });

    /**
     * The status a client watches: confirmed but not finished. `ready` is the
     * pipeline's to give, and it arrives whether the work succeeded or not.
     */
    it("holds the file at processing until the pipeline settles it", async () => {
      const { files, index } = servicesFor();
      const { project } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "spec.md",
        SPEC,
        "document"
      );

      // Completion confirmed the bytes and parked the file.
      expect((await files.findById(project, fileId)).status).toBe("processing");
      // And it is downloadable while it sits there: the bytes are verified.
      await expect(files.download(project, fileId)).resolves.toHaveProperty(
        "url"
      );

      await index.ingestPending();
      expect((await files.findById(project, fileId)).status).toBe("ready");
    });

    it("settles a file whose pipeline failed, with the reason on the step", async () => {
      const { files, index } = servicesFor();
      const { project } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "vanishes.md",
        SPEC,
        "document"
      );
      objects.drop(`${project.orgId}/${project.projectId ?? "org"}/${fileId}`);
      // Two passes: the first failure queues the one automatic retry, and the
      // file settles only once that retry has failed too.
      await index.ingestPending();
      await index.ingestPending();

      // The file is not broken; the step is.
      expect((await files.findById(project, fileId)).status).toBe("ready");
      const state = await index.getState(project, fileId);
      expect(state.status).toBe("failed");
      expect(state.error).toContain("404");
    });

    it("goes straight to ready when the preset asks for nothing", async () => {
      const { files } = servicesFor();
      const { project } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "notes.md",
        SPEC,
        "default"
      );
      expect((await files.findById(project, fileId)).status).toBe("ready");
    });

    it("holds again when a settled document is resubmitted", async () => {
      const { files, index } = servicesFor();
      const { project } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "spec.md",
        SPEC,
        "document"
      );
      await index.ingestPending();
      expect((await files.findById(project, fileId)).status).toBe("ready");

      await index.submit(project, fileId);
      expect((await files.findById(project, fileId)).status).toBe("processing");
      await index.ingestPending();
      expect((await files.findById(project, fileId)).status).toBe("ready");
    });

    /** A type no preset claims is stored and nothing else. */
    it("leaves a type nothing claims on the default preset, unindexed", async () => {
      const { files, index } = servicesFor();
      const { project } = await scopes();

      const created = await files.create(
        project,
        {
          groupId: project.groupId,
          type: "file",
          name: "model.ifc",
          contentType: "application/x-step",
          size: SPEC.length,
        },
        null
      );
      objects.put(
        `${project.orgId}/${project.projectId ?? "org"}/${created.file.id}`,
        SPEC
      );
      await files.complete(project, created.file.id, {});

      await expect(index.getState(project, created.file.id)).rejects.toThrow(
        /not indexed/i
      );
      expect(await index.ingestPending()).toBe(0);
    });

    /** The whole point: a question, answered from the document, with citations. */
    it("answers a question about an uploaded document, citing it", async () => {
      const { files, index } = servicesFor();
      const { project, readable } = await scopes();

      const fileId = await uploadDocument(
        files,
        project,
        "fire-spec.md",
        SPEC,
        "document"
      );
      await index.ingestPending();

      const answer = await index.ask(project, readable, {
        question: "What is the minimum clear width of an escape route?",
      });

      expect(answer.answer).toMatch(/1\.2/);
      expect(answer.sources.length).toBeGreaterThan(0);
      expect(answer.sources[0]?.fileId).toBe(fileId);
      expect(answer.sources[0]?.fileName).toBe("fire-spec.md");
      expect(answer.context).toContain("[1]");
    });

    /** And it declines rather than inventing, when the documents do not say. */
    it("says it cannot answer what the documents do not contain", async () => {
      const { files, index } = servicesFor();
      const { project, readable } = await scopes();

      await uploadDocument(files, project, "fire-spec.md", SPEC, "document");
      await index.ingestPending();

      const answer = await index.ask(project, readable, {
        question: "What is the required ceiling height of a plant room?",
      });
      // Asserting the refusal rather than the absence of a number: the model may
      // well mention the width it did find while explaining that it is not the
      // ceiling height, and that is a correct answer.
      expect(answer.answer).toMatch(/not|no |does not|cannot|unable/i);
    });

    /**
     * The run executor's document capability, driven the way the worker drives
     * it: a scope, the asker's subject, and nothing else. This is the boundary
     * where retrieval could answer as the wrong person, so it is worth a test of
     * its own rather than trust in the wiring.
     */
    it("answers for the asker the thread records, and nobody else", async () => {
      const { files, index } = servicesFor();
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);
      const scope = await projectScope(services, project.id);

      const fileId = await uploadDocument(
        files,
        scope,
        "fire-spec.md",
        SPEC,
        "document"
      );
      await index.ingestPending();

      const source = new PlatformRunFilesSource(index, services.checks);

      // The thread's own subject: what `thread.subject` stores and what the
      // authorization store keys on.
      const groups = await source.readableGroups(
        scope,
        owner.principal.subject
      );
      expect(groups.length).toBeGreaterThan(0);

      const { context, sources } = await source.context(scope, groups, {
        query: "minimum clear width of an escape route",
      });
      expect(context).toContain("1.2 m");
      expect(sources[0]?.fileId).toBe(fileId);
      expect(sources[0]?.fileName).toBe("fire-spec.md");
      expect(sources[0]?.index).toBe(1);

      // A stranger resolves no readable group here, so the same call sees
      // nothing rather than the owner's documents.
      const stranger = await makeUser(ctx.db, services, {
        email: `stranger-${randomUUID()}@example.test`,
      });
      const strangerGroups = await source.readableGroups(
        scope,
        stranger.principal.subject
      );
      expect(strangerGroups).toEqual([]);
      const blind = await source.context(scope, strangerGroups, {
        query: "minimum clear width of an escape route",
      });
      expect(blind.sources).toEqual([]);
    });

    it("hydrates the org library into a project search", async () => {
      const { files, index } = servicesFor();
      const { org, project, readable } = await scopes();

      const libraryFile = await uploadDocument(
        files,
        org,
        "org-standard.md",
        SPEC,
        "document"
      );
      await index.ingestPending();

      // The project sees the library it inherits.
      const hydrated = await index.search(project, readable, {
        query: "escape route width",
        topK: 5,
      });
      expect(hydrated.hits.map((entry) => entry.fileId)).toContain(libraryFile);

      // scope=project excludes it, the way a project file listing does.
      const own = await index.search(project, readable, {
        query: "escape route width",
        topK: 5,
        scope: "project",
      });
      expect(own.hits.map((entry) => entry.fileId)).not.toContain(libraryFile);
    });
  }
);
