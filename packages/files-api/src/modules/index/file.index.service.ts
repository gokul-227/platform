/**
 * `submit` records intent and returns; a worker claims the row and does the
 * download, extraction, chunking, embedding and upsert. A large PDF is tens of
 * seconds and several outbound calls, so doing it inline would make every upload
 * as slow as the slowest model and lose the work on a redeploy.
 *
 * Reads are a ladder: `search` ranks chunks, `retrieve` merges them into
 * passages under a token budget, `context` formats those, `ask` answers from
 * them. Every rung filters by the caller's readable groups and the partition
 * inside the query, because filtering after fetches another tenant's text.
 */

import type {
  AskFilesInput,
  AskFilesResponse,
  ChunkingOptions,
  ContextFilesResponse,
  FileIndexResponse,
  IndexFileInput,
  ResolvedScope,
  RetrievalMode,
  RetrieveFilesInput,
  RetrieveFilesResponse,
  SearchFilesInput,
  SearchFilesResponse,
} from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { type Config, ConfigToken } from "../../config/config";
import { type Database, DatabaseToken } from "../../database/database.module";
import {
  type FileRow,
  file,
  fileIndex,
  fileIndexTombstone,
} from "../../database/schema";
import { FileErrors } from "../file.errors";
import { FilePipelineSettler } from "../file.pipeline.settler";
import { type FileStorage, FileStorageToken } from "../storage/file.storage";
import { storageKeyFor } from "../storage/file.storage.key";
import { figureIdsFrom, figureObjectKey, figuresSection } from "./figures";
import { FileIndexErrors } from "./file.index.errors";
import {
  type ExtractedFigure,
  type FileIndexDeps,
  FileIndexDepsToken,
  type LexicalChunk,
  type VectorChunk,
  type VectorHit,
} from "./file.index.seams";
import { fuseRankings } from "./fusion";
import {
  budgetPassages,
  buildPassages,
  type DocumentChunks,
  type ExpandMode,
  formatContext,
} from "./passages";

const DEFAULT_SEARCH_TOP_K = 10;
const DEFAULT_RETRIEVE_TOP_K = 12;
const DEFAULT_MAX_TOKENS = 4000;
const MAX_ERROR_LENGTH = 2000;

/** What every rung of the retrieval ladder shares: the query and its filters. */
interface RetrievalQuery {
  filter?: Record<string, string | number | boolean> | undefined;
  minScore?: number | undefined;
  mode?: RetrievalMode | undefined;
  query: string;
  scope?: "project" | "org" | undefined;
}

/** The columns ingestion needs, which live on `file`, not on `file_index`. */
interface IngestTarget {
  attempts: number;
  attributes: Record<string, string | number | boolean>;
  chunking: ChunkingOptions | undefined;
  contentType: string;
  fileId: string;
  groupId: string;
  name: string;
  orgId: string;
  projectId: string | null;
}

@Injectable()
export class FileIndexService {
  private readonly logger = new Logger(FileIndexService.name);

  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(FileStorageToken) private readonly storage: FileStorage,
    @Inject(ConfigToken) private readonly config: Config,
    @Inject(FileIndexDepsToken) private readonly deps: FileIndexDeps,
    @Inject(FilePipelineSettler) private readonly settler: FilePipelineSettler
  ) {}

  /** Whether this deployment can index at all. */
  get isConfigured(): boolean {
    return this.deps.embedder !== null && this.deps.vectorStore !== null;
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  /**
   * Queue a file for indexing, or requeue an indexed one to re-extract it.
   * Returns the queued state, not the result.
   */
  async submit(
    scope: ResolvedScope,
    fileId: string,
    input: IndexFileInput = {}
  ): Promise<FileIndexResponse> {
    const row = await this.loadFile(scope, fileId);
    this.assertConfigured();
    if (row.type !== "file") {
      throw new PlatformError(FileErrors.NOT_A_FILE);
    }
    // `processing` is fine: a document already in the pipeline may be
    // resubmitted, which is how a failed extraction is retried.
    if (row.status === "pending") {
      throw new PlatformError(FileIndexErrors.NOT_READY);
    }
    const contentType = row.content?.contentType ?? "";
    if (!this.deps.extractor.supports(contentType, row.name)) {
      throw new PlatformError(
        FileIndexErrors.UNSUPPORTED_CONTENT_TYPE,
        `Nothing here can extract text from "${contentType}" (${row.name})`
      );
    }
    await this.enqueue(fileId, input);
    return await this.getState(scope, fileId);
  }

  /**
   * Record the intent to index. Separate from `submit` because the upload
   * pipeline calls it with no principal and no scope check to redo: the file was
   * just created by a caller the guard already vetted.
   */
  async enqueue(fileId: string, input: IndexFileInput = {}): Promise<void> {
    const values = {
      fileId,
      status: "pending" as const,
      error: null,
      attempts: 0,
      attributes: input.attributes ?? {},
      chunking: (input.chunking ?? null) as Record<string, unknown> | null,
      updatedAt: new Date(),
    };
    await this.db
      .insert(fileIndex)
      .values(values)
      .onConflictDoUpdate({ target: fileIndex.fileId, set: values });
    // Covers the resubmit of a settled file; `complete` already parked a fresh
    // upload, and this never moves one that is still `pending`.
    await this.settler.hold(fileId);
  }

  /** De-index without deleting the file. The bytes and the row stay. */
  async remove(scope: ResolvedScope, fileId: string): Promise<void> {
    const row = await this.loadFile(scope, fileId);
    // Figure objects are derived from the extraction being discarded, so they
    // go with it; the markdown about to be deleted is what names them.
    const indexRows = await this.db
      .select({ markdown: fileIndex.markdown })
      .from(fileIndex)
      .where(eq(fileIndex.fileId, fileId));
    const objectKey = storageKeyFor(row.orgId, row.projectId, fileId);
    for (const id of figureIdsFrom(indexRows[0]?.markdown)) {
      await this.storage.remove(figureObjectKey(objectKey, id));
    }
    await Promise.all([
      this.deps.vectorStore?.deleteDocument(row.orgId, fileId),
      this.deps.lexicalStore?.deleteDocument(row.orgId, fileId),
    ]);
    await this.db.delete(fileIndex).where(eq(fileIndex.fileId, fileId));
    await this.settler.settle(fileId);
  }

  async getState(
    scope: ResolvedScope,
    fileId: string
  ): Promise<FileIndexResponse> {
    await this.loadFile(scope, fileId);
    const row = await this.loadIndexRow(fileId);
    return {
      fileId,
      status: row.status as FileIndexResponse["status"],
      error: row.error,
      isIndexed: row.status === "indexed",
      chunkCount: row.chunkCount,
      indexedAt: row.indexedAt ? row.indexedAt.toISOString() : null,
    };
  }

  /** The extracted text, which is what retrieval actually searches. */
  async getText(scope: ResolvedScope, fileId: string): Promise<string> {
    const fileRow = await this.loadFile(scope, fileId);
    const row = await this.loadIndexRow(fileId);
    if (row.markdown === null) {
      throw new PlatformError(
        FileIndexErrors.NOT_INDEXED,
        `File "${fileId}" has no extracted text yet (status: ${row.status})`
      );
    }
    // Stable figure refs become signed URLs at read time, so a caller can
    // render the markdown as-is while the stored form never carries a secret.
    const ids = figureIdsFrom(row.markdown);
    if (ids.length === 0) {
      return row.markdown;
    }
    const objectKey = storageKeyFor(fileRow.orgId, fileRow.projectId, fileId);
    let markdown = row.markdown;
    for (const id of ids) {
      const download = await this.storage.createDownloadTarget(
        figureObjectKey(objectKey, id),
        id
      );
      markdown = markdown.replaceAll(`figure://${id}`, download.url);
    }
    return markdown;
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async search(
    scope: ResolvedScope,
    readableGroups: string[],
    input: SearchFilesInput
  ): Promise<SearchFilesResponse> {
    const hits = await this.queryHits(
      scope,
      readableGroups,
      input,
      input.topK ?? DEFAULT_SEARCH_TOP_K
    );
    if (hits.length === 0 || !input.withUrls) {
      return { hits };
    }
    const urls = await this.signUrls(hits.map((hit) => hit.fileId));
    return {
      hits: hits.map((hit) => {
        const url = urls.get(hit.fileId);
        return url === undefined ? hit : { ...hit, url };
      }),
    };
  }

  async retrieve(
    scope: ResolvedScope,
    readableGroups: string[],
    input: RetrieveFilesInput
  ): Promise<RetrieveFilesResponse> {
    const expand: ExpandMode = input.expand ?? "none";
    const hits = await this.queryHits(
      scope,
      readableGroups,
      input,
      input.topK ?? DEFAULT_RETRIEVE_TOP_K
    );
    if (hits.length === 0) {
      return { passages: [] };
    }

    const fileIds = [...new Set(hits.map((hit) => hit.fileId))];
    const documents = new Map<string, DocumentChunks>();
    if (expand !== "none") {
      const rows = await this.db
        .select({
          fileId: fileIndex.fileId,
          name: file.name,
          markdown: fileIndex.markdown,
          chunking: fileIndex.chunking,
        })
        .from(fileIndex)
        .innerJoin(file, eq(file.id, fileIndex.fileId))
        .where(inArray(fileIndex.fileId, fileIds));
      for (const row of rows) {
        if (!row.markdown) {
          continue;
        }
        documents.set(row.fileId, {
          fileName: row.name,
          chunks: this.deps.chunker.chunk(
            row.markdown,
            this.chunkingFor(row.chunking as ChunkingOptions | null)
          ),
        });
      }
    }

    let passages = budgetPassages(
      buildPassages(hits, documents, expand),
      input.maxTokens ?? DEFAULT_MAX_TOKENS
    );

    if (input.withUrls && passages.length > 0) {
      const urls = await this.signUrls(
        passages.map((passage) => passage.fileId)
      );
      passages = passages.map((passage) => {
        const url = urls.get(passage.fileId);
        return url === undefined ? passage : { ...passage, url };
      });
    }
    return { passages };
  }

  async context(
    scope: ResolvedScope,
    readableGroups: string[],
    input: RetrieveFilesInput
  ): Promise<ContextFilesResponse> {
    const { passages } = await this.retrieve(scope, readableGroups, input);
    return formatContext(passages);
  }

  async ask(
    scope: ResolvedScope,
    readableGroups: string[],
    input: AskFilesInput
  ): Promise<AskFilesResponse> {
    const answerer = this.deps.answerer;
    if (!answerer) {
      throw new PlatformError(FileIndexErrors.ANSWERER_NOT_CONFIGURED);
    }
    const { question, instructions, ...retrieveInput } = input;
    const { context, sources } = await this.context(scope, readableGroups, {
      ...retrieveInput,
      query: question,
    });
    if (sources.length === 0) {
      return {
        answer: "No indexed document in this scope matches the question.",
        context,
        sources,
      };
    }
    const answer = await answerer.answer({
      question,
      context,
      ...(instructions === undefined ? {} : { instructions }),
    });
    return { answer, context, sources };
  }

  // ── Worker surface ────────────────────────────────────────────────────────

  /**
   * Claim and ingest up to `ingestBatchSize` queued documents. Returns how many
   * were processed. `SKIP LOCKED` is what lets more than one replica run this
   * without two of them embedding the same document.
   */
  async ingestPending(): Promise<number> {
    if (!this.isConfigured) {
      return 0;
    }
    const batchSize = this.config.documentIndex?.ingestBatchSize ?? 5;
    const claimed = (await this.db.execute(sql`
      UPDATE "file_index" SET "status" = 'processing', "updated_at" = now()
      WHERE "file_id" IN (
        SELECT fi."file_id" FROM "file_index" fi
        JOIN "file" f ON f."id" = fi."file_id"
        WHERE fi."status" = 'pending'
          AND f."status" IN ('processing', 'ready')
          AND f."type" = 'file'
        ORDER BY fi."updated_at" ASC
        LIMIT ${batchSize}
        FOR UPDATE OF fi SKIP LOCKED
      )
      RETURNING "file_id"
    `)) as unknown as { rows?: { file_id: string }[] };

    const fileIds = (claimed.rows ?? []).map((row) => row.file_id);
    if (fileIds.length === 0) {
      return 0;
    }

    const targets = await this.loadIngestTargets(fileIds);
    for (const target of targets) {
      await this.ingest(target);
    }
    return targets.length;
  }

  /** Retry vector purges whose tombstones outlived a vector-store outage. */
  async retryPurges(limit = 20): Promise<number> {
    if (!(this.deps.vectorStore || this.deps.lexicalStore)) {
      return 0;
    }
    const rows = await this.db.select().from(fileIndexTombstone).limit(limit);
    let purged = 0;
    for (const row of rows) {
      try {
        // All three, and the tombstone survives unless every one succeeds: a
        // document left in either index still answers a search of that half,
        // and a figure object left behind is orphaned storage forever.
        await this.deps.vectorStore?.deleteDocument(row.orgId, row.fileId);
        await this.deps.lexicalStore?.deleteDocument(row.orgId, row.fileId);
        for (const key of row.figureKeys ?? []) {
          await this.storage.remove(key);
        }
        await this.db
          .delete(fileIndexTombstone)
          .where(eq(fileIndexTombstone.fileId, row.fileId));
        purged++;
      } catch (error) {
        // The tombstone stays; the next pass tries again.
        this.logger.warn(
          `Vector purge for file ${row.fileId} failed: ${describe(error)}`
        );
      }
    }
    return purged;
  }

  /**
   * Called from the delete cascade, before the file rows disappear. Writes the
   * purge intent first, then attempts it: the row is about to be gone, so an
   * outage here must not be able to leave vectors serving hits with nothing
   * behind them.
   */
  async tombstone(
    files: { fileId: string; orgId: string; projectId: string | null }[]
  ): Promise<void> {
    if (
      files.length === 0 ||
      !(this.deps.vectorStore || this.deps.lexicalStore)
    ) {
      return;
    }
    // The rows still exist here, and their markdown is the only record of
    // which figure objects were derived from them.
    const rows = await this.db
      .select({ fileId: fileIndex.fileId, markdown: fileIndex.markdown })
      .from(fileIndex)
      .where(
        inArray(
          fileIndex.fileId,
          files.map((entry) => entry.fileId)
        )
      );
    const markdownByFile = new Map(
      rows.map((row) => [row.fileId, row.markdown])
    );
    await this.db
      .insert(fileIndexTombstone)
      .values(
        files.map(({ fileId, orgId, projectId }) => ({
          fileId,
          orgId,
          figureKeys: figureIdsFrom(markdownByFile.get(fileId)).map((id) =>
            figureObjectKey(storageKeyFor(orgId, projectId, fileId), id)
          ),
        }))
      )
      .onConflictDoNothing();
    await this.retryPurges(files.length);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Store extracted figures as derived objects and append their captions to
   * the markdown, where they chunk, embed and expand like any other text.
   * Replaces the previous extraction's objects, so re-indexing cannot
   * accumulate; a failure lands on the row like any other ingest failure.
   */
  private async attachFigures(
    target: IngestTarget,
    markdown: string,
    figures: ExtractedFigure[]
  ): Promise<string> {
    const captioner = this.deps.captioner as NonNullable<
      FileIndexDeps["captioner"]
    >;
    const objectKey = storageKeyFor(
      target.orgId,
      target.projectId,
      target.fileId
    );

    const previous = await this.db
      .select({ markdown: fileIndex.markdown })
      .from(fileIndex)
      .where(eq(fileIndex.fileId, target.fileId));
    for (const staleId of figureIdsFrom(previous[0]?.markdown)) {
      await this.storage.remove(figureObjectKey(objectKey, staleId));
    }

    const captioned: { caption: string; id: string; page?: number }[] = [];
    for (const figure of figures) {
      await this.putFigure(figureObjectKey(objectKey, figure.id), figure);
      captioned.push({
        id: figure.id,
        caption: await captioner.caption(figure),
        ...(figure.page === undefined ? {} : { page: figure.page }),
      });
    }
    return `${markdown}${figuresSection(captioned)}`;
  }

  /** Write one derived object through the storage seam's signed PUT. */
  private async putFigure(key: string, figure: ExtractedFigure): Promise<void> {
    const { target } = await this.storage.createUpload({
      key,
      contentType: figure.contentType,
      sizeBytes: figure.data.length,
    });
    if (target.type !== "put") {
      // Backends switch to sessions above a threshold no real figure reaches.
      throw new PlatformError(
        FileIndexErrors.EXTRACTION_FAILED,
        `Figure ${key} is too large to store with one PUT`
      );
    }
    const response = await fetch(target.url, {
      method: target.method,
      headers: target.headers,
      body: Buffer.from(figure.data),
    });
    if (!response.ok) {
      throw new PlatformError(
        FileIndexErrors.EXTRACTION_FAILED,
        `Storing figure ${key} answered ${response.status}`
      );
    }
  }

  private assertConfigured(): void {
    if (!this.isConfigured) {
      throw new PlatformError(FileIndexErrors.NOT_CONFIGURED);
    }
  }

  /** Deployment defaults under a per-document override. */
  private chunkingFor(
    perDocument: ChunkingOptions | null | undefined
  ): ChunkingOptions | undefined {
    const defaults = this.config.documentIndex?.chunking;
    if (!(defaults || perDocument)) {
      return;
    }
    return { ...defaults, ...perDocument };
  }

  /** Whether this deployment can match terms as well as meaning. */
  get isLexicalConfigured(): boolean {
    return this.deps.lexicalStore !== null;
  }

  /**
   * The mode actually used. `hybrid` degrades to `semantic` where no lexical
   * index is configured, because a caller asking for the best available matching
   * wants the best available, not an error.
   */
  private resolveMode(requested: RetrievalMode | undefined): RetrievalMode {
    const mode =
      requested ?? this.config.documentIndex?.defaultMode ?? "hybrid";
    if (mode === "semantic") {
      return "semantic";
    }
    if (this.isLexicalConfigured) {
      return mode;
    }
    if (mode === "lexical") {
      throw new PlatformError(
        FileIndexErrors.NOT_CONFIGURED,
        'This deployment has no lexical index, so `mode: "lexical"` cannot be served'
      );
    }
    return "semantic";
  }

  private async queryHits(
    scope: ResolvedScope,
    readableGroups: string[],
    input: RetrievalQuery,
    topK: number
  ): Promise<VectorHit[]> {
    this.assertConfigured();
    const mode = this.resolveMode(input.mode);

    // `scope=org` on a project search means the library alone, which is the same
    // query an org-level search runs.
    const isLibraryOnly = scope.projectId === null || input.scope === "org";
    const access = {
      topK,
      orgId: scope.orgId,
      groupIds: readableGroups,
      projectId: isLibraryOnly ? null : scope.projectId,
      includeOrgLibrary: input.scope !== "project",
      ...(input.filter ? { filter: input.filter } : {}),
    };

    // `minScore` is applied per ranking, while the numbers still mean something:
    // after fusion a score is a rank aggregate, not a similarity.
    const floor = (hits: VectorHit[]): VectorHit[] =>
      input.minScore === undefined
        ? hits
        : hits.filter((hit) => hit.score >= (input.minScore as number));

    const semantic = async (): Promise<VectorHit[]> => {
      const embedder = this.deps.embedder as NonNullable<
        FileIndexDeps["embedder"]
      >;
      const store = this.deps.vectorStore as NonNullable<
        FileIndexDeps["vectorStore"]
      >;
      return floor(
        await store.query({
          ...access,
          embedding: await embedder.embedQuery(input.query),
        })
      );
    };

    const lexical = async (): Promise<VectorHit[]> => {
      const store = this.deps.lexicalStore as NonNullable<
        FileIndexDeps["lexicalStore"]
      >;
      return floor(await store.query({ ...access, query: input.query }));
    };

    if (mode === "semantic") {
      return await semantic();
    }
    if (mode === "lexical") {
      return await lexical();
    }
    // Both halves in parallel: they are independent round trips to two indexes,
    // and the slower one bounds the query either way.
    const rankings = await Promise.all([semantic(), lexical()]);
    return fuseRankings(rankings, topK);
  }

  /** One signed URL per distinct file, for the callers that asked for them. */
  private async signUrls(fileIds: string[]): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    const unique = [...new Set(fileIds)];
    if (unique.length === 0) {
      return urls;
    }
    const rows = await this.db
      .select({
        id: file.id,
        name: file.name,
        orgId: file.orgId,
        projectId: file.projectId,
      })
      .from(file)
      .where(inArray(file.id, unique));
    for (const row of rows) {
      const target = await this.storage.createDownloadTarget(
        storageKeyFor(row.orgId, row.projectId, row.id),
        row.name
      );
      urls.set(row.id, target.url);
    }
    return urls;
  }

  private async loadFile(
    scope: ResolvedScope,
    fileId: string
  ): Promise<FileRow> {
    const rows = await this.db
      .select()
      .from(file)
      .where(and(eq(file.id, fileId), eq(file.orgId, scope.orgId)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(FileErrors.NOT_FOUND);
    }
    return row;
  }

  private async loadIndexRow(fileId: string) {
    const rows = await this.db
      .select()
      .from(fileIndex)
      .where(eq(fileIndex.fileId, fileId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(FileIndexErrors.NOT_INDEXED);
    }
    return row;
  }

  private async loadIngestTargets(fileIds: string[]): Promise<IngestTarget[]> {
    const rows = await this.db
      .select({
        fileId: fileIndex.fileId,
        attempts: fileIndex.attempts,
        attributes: fileIndex.attributes,
        chunking: fileIndex.chunking,
        orgId: file.orgId,
        projectId: file.projectId,
        groupId: file.groupId,
        name: file.name,
        content: file.content,
      })
      .from(fileIndex)
      .innerJoin(file, eq(file.id, fileIndex.fileId))
      .where(inArray(fileIndex.fileId, fileIds));

    return rows.map((row) => ({
      fileId: row.fileId,
      attempts: row.attempts,
      orgId: row.orgId,
      projectId: row.projectId,
      groupId: row.groupId,
      name: row.name,
      contentType: row.content?.contentType ?? "",
      attributes: row.attributes ?? {},
      chunking: this.chunkingFor(row.chunking as ChunkingOptions | null),
    }));
  }

  /**
   * One document, end to end. A failure is recorded on the row rather than
   * thrown: the worker is processing a batch, and one unreadable PDF must not
   * stop the others.
   */
  private async ingest(target: IngestTarget): Promise<void> {
    try {
      const embedder = this.deps.embedder as NonNullable<
        FileIndexDeps["embedder"]
      >;
      const store = this.deps.vectorStore as NonNullable<
        FileIndexDeps["vectorStore"]
      >;
      const download = await this.storage.createDownloadTarget(
        storageKeyFor(target.orgId, target.projectId, target.fileId),
        target.name
      );
      const response = await fetch(download.url);
      if (!response.ok) {
        throw new Error(`downloading the object answered ${response.status}`);
      }
      const data = new Uint8Array(await response.arrayBuffer());

      const { markdown: extracted, figures = [] } =
        await this.deps.extractor.extract({
          data,
          contentType: target.contentType,
          fileName: target.name,
          url: download.url,
        });
      const markdown =
        this.deps.captioner && figures.length > 0
          ? await this.attachFigures(target, extracted, figures)
          : extracted;

      const chunks = this.deps.chunker.chunk(markdown, target.chunking);
      // The heading path is prepended for embedding only. Retrieval returns the
      // chunk as it reads in the document, so a hit is quotable as-is.
      const texts = chunks.map((chunk) =>
        chunk.heading ? `${chunk.heading}\n\n${chunk.text}` : chunk.text
      );
      const embeddings =
        texts.length > 0 ? await embedder.embedDocuments(texts) : [];

      const vectors: VectorChunk[] = chunks.map((chunk, position) => ({
        ...chunk,
        embedding: embeddings[position] as number[],
        embeddedText: texts[position] as string,
        fileId: target.fileId,
        fileName: target.name,
        scope: {
          orgId: target.orgId,
          projectId: target.projectId,
          groupId: target.groupId,
        },
        attributes: target.attributes,
      }));
      await store.upsertDocument(target.orgId, target.fileId, vectors);

      // The lexical half indexes the same chunks under the same ids. The text it
      // indexes is the heading-prefixed form, so a term in a heading counts for
      // the chunks beneath it, matching what the embedder saw.
      const lexical = this.deps.lexicalStore;
      if (lexical) {
        const lexicalChunks: LexicalChunk[] = chunks.map((chunk, position) => ({
          ...chunk,
          indexedText: texts[position] as string,
          fileId: target.fileId,
          fileName: target.name,
          scope: {
            orgId: target.orgId,
            projectId: target.projectId,
            groupId: target.groupId,
          },
          attributes: target.attributes,
        }));
        await lexical.upsertDocument(
          target.orgId,
          target.fileId,
          lexicalChunks
        );
      }

      await this.db
        .update(fileIndex)
        .set({
          status: "indexed",
          error: null,
          chunkCount: chunks.length,
          indexedAt: new Date(),
          markdown,
          updatedAt: new Date(),
        })
        .where(eq(fileIndex.fileId, target.fileId));
      await this.settler.settle(target.fileId);
    } catch (error) {
      // One automatic retry, on the next worker pass: enough to ride out a
      // transient upstream blip (an OCR 429, an embedder timeout), cheap enough
      // that a deterministic failure just fails twice. `updated_at` puts the
      // requeued row behind the rest of the queue.
      const willRetry = target.attempts === 0;
      this.logger.warn(
        `Indexing file ${target.fileId} failed${
          willRetry ? ", retrying once" : ""
        }: ${describe(error)}`
      );
      await this.db
        .update(fileIndex)
        .set({
          status: willRetry ? "pending" : "failed",
          attempts: target.attempts + 1,
          error: describe(error).slice(0, MAX_ERROR_LENGTH),
          updatedAt: new Date(),
        })
        .where(eq(fileIndex.fileId, target.fileId));
      if (!willRetry) {
        // A failed step owes nothing further, so the file settles rather than
        // sitting in `processing` for a retry nobody scheduled.
        await this.settler.settle(target.fileId);
      }
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
