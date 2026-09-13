/**
 * Small interfaces with the vendor behind them, chosen from config at boot, each
 * swappable without the others noticing.
 *
 * Retrieval has two halves: `Embedder` with `VectorStore` matches meaning, and
 * `LexicalStore` matches terms, which is what finds an exact standard number.
 * Either alone works, and a deployment configuring neither still stores files
 * and answers 503 from the index endpoints.
 */

import type { ChunkingOptions } from "@aec-craft/platform-contracts";

/** A piece of a document, before it is embedded. */
export interface DocumentChunk {
  /** Heading path at this point, e.g. `Fire safety > Escape routes`. */
  heading?: string;
  /** 0-based position within the document. */
  index: number;
  /** 1-based source page, when the extractor preserved page markers. */
  page?: number;
  text: string;
}

export interface Chunker {
  chunk(markdown: string, options?: ChunkingOptions): DocumentChunk[];
}

export interface ExtractInput {
  contentType: string;
  data: Uint8Array;
  fileName: string;
  /** Signed read URL of the object, for extractors that fetch it themselves. */
  url?: string;
}

/** An image embedded in a document, extracted alongside its text. */
export interface ExtractedFigure {
  contentType: string;
  data: Uint8Array;
  /** Stable id within the document, e.g. "img-0.jpeg". */
  id: string;
  /** 1-based source page, when known. */
  page?: number;
}

export interface Extractor {
  /**
   * Markdown, with `<!-- page:N -->` markers preserved where the source had
   * pages. The markers are consumed by the chunker, never embedded. Figures
   * come back only when the deployment captions them; the markdown then points
   * at each one with a stable `figure://id` ref.
   */
  extract(
    input: ExtractInput
  ): Promise<{ markdown: string; figures?: ExtractedFigure[] }>;
  /** Whether this deployment can turn the content type into text at all. */
  supports(contentType: string, fileName: string): boolean;
}

/**
 * Describes an extracted figure in one dense paragraph, for indexing. What
 * makes a drawing or site photo retrievable: the caption is text, so it joins
 * the document's own chunks in the same embedding space.
 */
export interface Captioner {
  caption(figure: { contentType: string; data: Uint8Array }): Promise<string>;
}

export interface Embedder {
  /** Output dimensionality. Must equal the vector index's dimension. */
  readonly dimensions: number;
  /** Index side: embed document chunks. */
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Query side: embed a search query, which some providers treat differently. */
  embedQuery(text: string): Promise<number[]>;
}

/**
 * Scope carried on every vector so authorization can be applied in-query.
 *
 * Stamped at ingestion, which means it is a copy of the file's scope rather than
 * a reference to it. TODO(#152): a file that changes group leaves its vectors
 * filtered by the old one.
 */
export interface VectorScope {
  /** The group that answers for the file; filtered against the reader's set. */
  groupId: string;
  /** Namespace: the owning org, a hard tenant boundary. */
  orgId: string;
  /** Null for an org-library document. */
  projectId: string | null;
}

export interface VectorChunk extends DocumentChunk {
  attributes: Record<string, string | number | boolean>;
  /** The exact string sent to the embedder, heading prefix included. */
  embeddedText: string;
  embedding: number[];
  fileId: string;
  fileName: string;
  scope: VectorScope;
}

export interface VectorQuery {
  embedding: number[];
  /** Attribute equality filters, ANDed. */
  filter?: Record<string, string | number | boolean>;
  /**
   * Groups the caller may read. Applied inside the query, never after it: a
   * post-filter cannot see what a projection already dropped, and here that
   * would mean returning another tenant's text.
   */
  groupIds: string[];
  /**
   * Also match org-library documents, the way a project file listing hydrates
   * the library into its results. Ignored when `projectId` is null.
   */
  includeOrgLibrary: boolean;
  orgId: string;
  /**
   * The project being searched, or `null` to search the org library alone.
   *
   * Both this and `groupIds` are required, and neither implies the other. An
   * org-wide group is readable from every project in the org, so a group filter
   * on its own would answer a search in one project with another project's
   * documents.
   */
  projectId: string | null;
  topK: number;
}

export interface VectorHit {
  chunkIndex: number;
  fileId: string;
  fileName: string;
  heading: string | null;
  page: number | null;
  score: number;
  text: string;
}

/**
 * The lexical index: the same chunks, matched by term rather than by meaning.
 *
 * A separate store from the dense one because the two are genuinely different
 * engines, and a deployment may have either. It takes text, not vectors: how a
 * term is weighted is the implementation's business, whether that is Postgres
 * deriving a `tsvector` or a sparse vector store wanting explicit weights.
 *
 * Chunks are identified the same way in both halves (`fileId` + `chunkIndex`), so
 * the two rankings fuse by identity with no lookup.
 */
export interface LexicalStore {
  deleteDocument(orgId: string, fileId: string): Promise<void>;
  /** Same access rules as the dense query; `sparse` replaces the embedding. */
  query(query: LexicalQuery): Promise<VectorHit[]>;
  /** Replaces the document's sparse vectors. */
  upsertDocument(
    orgId: string,
    fileId: string,
    chunks: LexicalChunk[]
  ): Promise<void>;
}

export interface LexicalChunk extends DocumentChunk {
  attributes: Record<string, string | number | boolean>;
  fileId: string;
  fileName: string;
  /**
   * What gets searched: the heading-prefixed form, the same string the embedder
   * saw. `text` stays what a hit displays.
   */
  indexedText: string;
  scope: VectorScope;
}

/** A lexical query is a dense query with the embedding swapped for the words. */
export type LexicalQuery = Omit<VectorQuery, "embedding"> & {
  /** The raw query text. Each store tokenises it its own way. */
  query: string;
};

export interface VectorStore {
  deleteDocument(orgId: string, fileId: string): Promise<void>;
  query(query: VectorQuery): Promise<VectorHit[]>;
  /** Replaces a document's vectors wholesale. Re-indexing must not accumulate. */
  upsertDocument(
    orgId: string,
    fileId: string,
    chunks: VectorChunk[]
  ): Promise<void>;
}

export interface Answerer {
  answer(input: {
    question: string;
    context: string;
    instructions?: string;
  }): Promise<string>;
}

/**
 * What the index module resolves at boot. `null` for any seam the deployment
 * did not configure; the service turns that into the right 503 rather than a
 * crash, so uploads are never held hostage to a missing embedding provider.
 */
export interface FileIndexDeps {
  answerer: Answerer | null;
  /** Absent: figures are dropped at extraction and only text is indexed. */
  captioner: Captioner | null;
  chunker: Chunker;
  embedder: Embedder | null;
  extractor: Extractor;
  /**
   * The lexical half. Absent means `mode: "hybrid"` degrades to `semantic`
   * rather than failing, and `mode: "lexical"` answers 503.
   */
  lexicalStore: LexicalStore | null;
  vectorStore: VectorStore | null;
}

export const FileIndexDepsToken = Symbol.for(
  "@aec-craft/platform-files-api:file-index-deps"
);
