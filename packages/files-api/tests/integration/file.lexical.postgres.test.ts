import { randomUUID } from "node:crypto";
import type { ResolvedScope } from "@aec-craft/platform-contracts";
import { file, fileIndex } from "@aec-craft/platform-files-api";
import { createPostgresLexicalStore } from "@aec-craft/platform-files-api/nest";
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
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

/**
 * The lexical half on its own, against real Postgres.
 *
 * Separate from the pipeline suite because it needs no embedding model: this is
 * the half that runs on `to_tsvector` and nothing else, so it stays runnable when
 * Vertex credentials are absent or expired. It is also where the authorization
 * claim is worth testing directly, since the lexical path enforces scope in SQL
 * rather than in a vector store's metadata filter.
 */

describe.skipIf(!dbAvailable())("Postgres lexical store (integration)", () => {
  const ctx = useTestDb();

  function store() {
    return createPostgresLexicalStore({ db: ctx.filesDb });
  }

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
   * A `ready` file with an index row, which is what the store joins against.
   * Created directly rather than through an upload, because the bytes are beside
   * the point here.
   */
  async function indexedFile(
    scope: ResolvedScope,
    name: string
  ): Promise<string> {
    const id = randomUUID();
    await ctx.filesDb.insert(file).values({
      id,
      orgId: scope.orgId,
      projectId: scope.projectId,
      groupId: scope.groupId,
      type: "file",
      name,
      status: "ready",
      content: { contentType: "text/markdown", size: 1, checksum: null },
    });
    await ctx.filesDb
      .insert(fileIndex)
      .values({ fileId: id, status: "indexed" });
    return id;
  }

  const chunk = (
    index: number,
    text: string,
    heading: string | null,
    scope: ResolvedScope,
    fileId: string,
    fileName: string
  ) => ({
    index,
    text,
    // Heading-prefixed, as the embedder sees it, so heading terms count.
    indexedText: heading ? `${heading}\n\n${text}` : text,
    ...(heading === null ? {} : { heading }),
    fileId,
    fileName,
    scope: {
      orgId: scope.orgId,
      projectId: scope.projectId,
      groupId: scope.groupId,
    },
    attributes: {},
  });

  const query = (scope: ResolvedScope, readable: string[], text: string) => ({
    query: text,
    topK: 10,
    orgId: scope.orgId,
    groupIds: readable,
    projectId: scope.projectId,
    includeOrgLibrary: true,
  });

  it("finds a chunk by its terms and returns it with its heading and page", async () => {
    const lexical = store();
    const { project, readable } = await scopes();
    const fileId = await indexedFile(project, "spec.md");

    await lexical.upsertDocument(project.orgId, fileId, [
      {
        ...chunk(
          0,
          "Every escape route shall have a clear width of not less than 1.2 m.",
          "Fire safety",
          project,
          fileId,
          "spec.md"
        ),
        page: 3,
      },
      chunk(
        1,
        "Party walls shall achieve a weighted sound reduction index of 53 dB.",
        "Acoustics",
        project,
        fileId,
        "spec.md"
      ),
    ]);

    const hits = await lexical.query(
      query(project, readable, "escape route width")
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.fileId).toBe(fileId);
    expect(hits[0]?.chunkIndex).toBe(0);
    expect(hits[0]?.text).toContain("1.2 m");
    expect(hits[0]?.heading).toBe("Fire safety");
    expect(hits[0]?.page).toBe(3);
    expect(hits[0]?.fileName).toBe("spec.md");
    expect(hits[0]?.score).toBeGreaterThan(0);
  });

  /** What the hand-rolled encoder could not do, and the reason for this store. */
  it("stems, so a query in a different word form still matches", async () => {
    const lexical = store();
    const { project, readable } = await scopes();
    const fileId = await indexedFile(project, "spec.md");

    await lexical.upsertDocument(project.orgId, fileId, [
      chunk(
        0,
        "Escape routes must be kept clear of obstructions.",
        null,
        project,
        fileId,
        "spec.md"
      ),
    ]);

    // Singular query against a plural document, and vice versa.
    expect(await lexical.query(query(project, readable, "route"))).toHaveLength(
      1
    );
    expect(
      await lexical.query(query(project, readable, "obstruction"))
    ).toHaveLength(1);
  });

  it("matches a term that appears only in the heading", async () => {
    const lexical = store();
    const { project, readable } = await scopes();
    const fileId = await indexedFile(project, "spec.md");

    await lexical.upsertDocument(project.orgId, fileId, [
      chunk(
        0,
        "Minimum width is 1.2 m.",
        "Fire safety",
        project,
        fileId,
        "spec.md"
      ),
    ]);

    const hits = await lexical.query(query(project, readable, "fire safety"));
    expect(hits).toHaveLength(1);
    // The heading is not in the displayed text; only in what was indexed.
    expect(hits[0]?.text).not.toContain("Fire");
  });

  it("finds nothing for a query sharing no term", async () => {
    const lexical = store();
    const { project, readable } = await scopes();
    const fileId = await indexedFile(project, "spec.md");

    await lexical.upsertDocument(project.orgId, fileId, [
      chunk(0, "Minimum width is 1.2 m.", null, project, fileId, "spec.md"),
    ]);

    expect(
      await lexical.query(query(project, readable, "acoustic separation"))
    ).toEqual([]);
  });

  it("finds nothing for a query of nothing but stopwords", async () => {
    const lexical = store();
    const { project, readable } = await scopes();
    const fileId = await indexedFile(project, "spec.md");

    await lexical.upsertDocument(project.orgId, fileId, [
      chunk(0, "Minimum width is 1.2 m.", null, project, fileId, "spec.md"),
    ]);

    expect(await lexical.query(query(project, readable, "the and of"))).toEqual(
      []
    );
  });

  it("tolerates punctuation a raw tsquery would choke on", async () => {
    const lexical = store();
    const { project, readable } = await scopes();
    const fileId = await indexedFile(project, "spec.md");

    await lexical.upsertDocument(project.orgId, fileId, [
      chunk(0, "Design to EN 1992-1-1.", null, project, fileId, "spec.md"),
    ]);

    // `to_tsquery` would throw on these; `websearch_to_tsquery` does not.
    for (const text of ["EN 1992-1-1", "what about & | ! ( )", '"EN 1992"']) {
      await expect(
        lexical.query(query(project, readable, text))
      ).resolves.toBeInstanceOf(Array);
    }
  });

  describe("authorization", () => {
    it("returns nothing when the caller may read no group", async () => {
      const lexical = store();
      const { project } = await scopes();
      const fileId = await indexedFile(project, "spec.md");

      await lexical.upsertDocument(project.orgId, fileId, [
        chunk(0, "Escape route width.", null, project, fileId, "spec.md"),
      ]);

      expect(await lexical.query(query(project, [], "escape route"))).toEqual(
        []
      );
    });

    it("keeps one org's chunks out of another org's search", async () => {
      const lexical = store();
      const first = await scopes();
      const second = await scopes();
      const fileId = await indexedFile(first.project, "spec.md");

      await lexical.upsertDocument(first.project.orgId, fileId, [
        chunk(0, "Escape route width.", null, first.project, fileId, "spec.md"),
      ]);

      expect(
        await lexical.query(
          query(first.project, first.readable, "escape route")
        )
      ).toHaveLength(1);
      expect(
        await lexical.query(
          query(second.project, second.readable, "escape route")
        )
      ).toEqual([]);
    });

    it("hydrates the org library into a project search, and narrows on request", async () => {
      const lexical = store();
      const { org, project, readable } = await scopes();
      const libraryFile = await indexedFile(org, "standard.md");

      await lexical.upsertDocument(org.orgId, libraryFile, [
        chunk(0, "Escape route width.", null, org, libraryFile, "standard.md"),
      ]);

      // A project search sees the library it inherits.
      expect(
        await lexical.query(query(project, readable, "escape route"))
      ).toHaveLength(1);

      // Narrowed to the project's own, it does not.
      expect(
        await lexical.query({
          ...query(project, readable, "escape route"),
          includeOrgLibrary: false,
        })
      ).toEqual([]);

      // An org-level search sees the library.
      expect(
        await lexical.query(query(org, readable, "escape route"))
      ).toHaveLength(1);
    });

    it("does not return a chunk whose file is still pending", async () => {
      const lexical = store();
      const { project, readable } = await scopes();
      const fileId = await indexedFile(project, "spec.md");

      await lexical.upsertDocument(project.orgId, fileId, [
        chunk(0, "Escape route width.", null, project, fileId, "spec.md"),
      ]);
      await ctx.filesDb
        .update(file)
        .set({ status: "pending" })
        .where(eq(file.id, fileId));

      expect(
        await lexical.query(query(project, readable, "escape route"))
      ).toEqual([]);
    });
  });

  describe("replace semantics", () => {
    it("re-indexing shorter leaves no stale chunks", async () => {
      const lexical = store();
      const { project, readable } = await scopes();
      const fileId = await indexedFile(project, "spec.md");

      await lexical.upsertDocument(project.orgId, fileId, [
        chunk(0, "Escape route width one.", null, project, fileId, "spec.md"),
        chunk(1, "Escape route width two.", null, project, fileId, "spec.md"),
        chunk(2, "Escape route width three.", null, project, fileId, "spec.md"),
      ]);
      expect(
        await lexical.query(query(project, readable, "escape route"))
      ).toHaveLength(3);

      await lexical.upsertDocument(project.orgId, fileId, [
        chunk(0, "Escape route rewritten.", null, project, fileId, "spec.md"),
      ]);
      const hits = await lexical.query(
        query(project, readable, "escape route")
      );
      expect(hits).toHaveLength(1);
      expect(hits[0]?.text).toContain("rewritten");
    });

    it("de-indexing removes every chunk", async () => {
      const lexical = store();
      const { project, readable } = await scopes();
      const fileId = await indexedFile(project, "spec.md");

      await lexical.upsertDocument(project.orgId, fileId, [
        chunk(0, "Escape route width.", null, project, fileId, "spec.md"),
      ]);
      await lexical.deleteDocument(project.orgId, fileId);

      expect(
        await lexical.query(query(project, readable, "escape route"))
      ).toEqual([]);
    });

    it("upserting no chunks is a delete, not a no-op", async () => {
      const lexical = store();
      const { project, readable } = await scopes();
      const fileId = await indexedFile(project, "spec.md");

      await lexical.upsertDocument(project.orgId, fileId, [
        chunk(0, "Escape route width.", null, project, fileId, "spec.md"),
      ]);
      await lexical.upsertDocument(project.orgId, fileId, []);

      expect(
        await lexical.query(query(project, readable, "escape route"))
      ).toEqual([]);
    });
  });
});
