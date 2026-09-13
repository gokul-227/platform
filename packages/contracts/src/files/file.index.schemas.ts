/**
 * The document index: the searchable projection of a file's text.
 *
 * A file becomes searchable when an upload preset's pipeline says so, or when
 * a caller submits it explicitly. Indexing is asynchronous, so every write
 * here answers with a status rather than a result, and the retrieval side is a
 * ladder: `search` returns ranked chunks, `retrieve` widens and merges them
 * into passages under a token budget, `context` formats those into one string
 * with numbered sources, and `ask` grounds a generated answer in it. A caller
 * takes the rung it needs and pays for nothing above it.
 */

import { z } from "zod";

import { fileScopeFilterSchema } from "./shared";

// ── Index state ─────────────────────────────────────────────────────────────
export const fileIndexStatusSchema = z
  .enum(["pending", "processing", "indexed", "failed"])
  .describe(
    "`pending` = queued, nothing extracted yet; `processing` = a worker holds it; `indexed` = searchable; `failed` = the reason is in `error`, and resubmitting retries."
  );
export type FileIndexStatus = z.infer<typeof fileIndexStatusSchema>;

export const fileIndexResponseSchema = z
  .object({
    fileId: z.string().uuid(),
    status: fileIndexStatusSchema,
    error: z
      .string()
      .nullable()
      .describe("Why the last ingestion attempt failed; null otherwise."),
    isIndexed: z
      .boolean()
      .describe(
        "Convenience for `status === 'indexed'`: this file is searchable now."
      ),
    chunkCount: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe("How many chunks the document produced; null until indexed."),
    indexedAt: z.string().datetime().nullable(),
  })
  .describe("A file's position in the document index.");
export type FileIndexResponse = z.infer<typeof fileIndexResponseSchema>;

// ── Submitting a file ───────────────────────────────────────────────────────
export const chunkingOptionsSchema = z
  .object({
    maxTokens: z
      .number()
      .int()
      .min(64)
      .max(2048)
      .optional()
      .describe("Approximate ceiling per chunk. Default 256."),
    overlap: z
      .number()
      .min(0)
      .max(0.5)
      .optional()
      .describe(
        "Fraction of a chunk repeated into the next, applied only where a section had to be split by size. Default 0.2."
      ),
    strategy: z
      .enum(["structure", "fixed"])
      .optional()
      .describe(
        "`structure` (default) cuts on headings and paragraphs first, so boundaries land where the author put them. `fixed` windows the document blindly."
      ),
  })
  .describe(
    "Per-document chunking overrides. Omit to use the deployment defaults."
  );
export type ChunkingOptions = z.infer<typeof chunkingOptionsSchema>;

/** Filterable scalars stored on every chunk of a document. */
export const indexAttributesSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .describe(
    "Your own scalars, copied onto every chunk and filterable at search time (e.g. `{ discipline: 'structural', revision: 3 }`)."
  );

export const indexFileInputSchema = z
  .object({
    attributes: indexAttributesSchema.optional(),
    chunking: chunkingOptionsSchema.optional(),
  })
  .describe(
    "Submit a `ready` file for indexing, or resubmit an indexed one to re-extract it. Returns immediately; a worker does the work."
  );
export type IndexFileInput = z.infer<typeof indexFileInputSchema>;

// ── Retrieval: shared query shape ───────────────────────────────────────────
const queryField = z
  .string()
  .min(1)
  .max(2000)
  .describe("Natural-language query. It is embedded, not parsed.");

export const retrievalModeSchema = z
  .enum(["hybrid", "semantic", "lexical"])
  .describe(
    "How to match. `semantic` compares meaning, so it finds a passage that shares no words with the query and is weak on exact identifiers and numbers. " +
      "`lexical` matches terms, so it finds `EN 1992-1-1` or a drawing number exactly and misses paraphrase. " +
      "`hybrid` (the default) runs both and fuses the rankings, which is what you want unless you know which failure you would rather have. " +
      "Falls back to `semantic` on a deployment with no lexical index."
  );
export type RetrievalMode = z.infer<typeof retrievalModeSchema>;

const searchScopeFields = {
  mode: retrievalModeSchema.optional(),
  scope: fileScopeFilterSchema
    .optional()
    .describe(
      "Narrow a project search the way a project file listing narrows: `project` searches the project's own documents, `org` searches only the inherited library. Default is both. Not accepted on an org search."
    ),
  filter: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe(
      "Attribute equality filters, ANDed, matched against the `attributes` supplied at index time."
    ),
  minScore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      "Drop hits below this cosine similarity. No floor by default. Applied to the semantic ranking, before any " +
        "fusion, where the number still means a similarity; it does not filter the lexical ranking, whose scores are " +
        "on a different scale."
    ),
  withUrls: z
    .boolean()
    .optional()
    .describe(
      "Attach a short-lived signed download URL per distinct source file."
    ),
};

export const searchFilesInputSchema = z
  .object({
    query: queryField,
    topK: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("How many chunks to return. Default 10."),
    ...searchScopeFields,
  })
  .describe(
    "Rank individual chunks by similarity. The lowest rung of the ladder."
  );
export type SearchFilesInput = z.infer<typeof searchFilesInputSchema>;

export const searchHitSchema = z
  .object({
    fileId: z.string().uuid(),
    fileName: z.string(),
    chunkIndex: z.number().int().nonnegative(),
    text: z.string().describe("The chunk as it reads in the document."),
    heading: z
      .string()
      .nullable()
      .describe(
        "Heading path at this point, e.g. `Fire safety > Escape routes`."
      ),
    page: z
      .number()
      .int()
      .positive()
      .nullable()
      .describe(
        "1-based source page, when the extractor preserved page markers."
      ),
    score: z
      .number()
      .describe(
        "How this hit was ranked, on a scale that depends on `mode`: cosine similarity in 0..1 for `semantic`, " +
          "an unbounded positive term-weight sum for `lexical`, and a rank-fusion aggregate for `hybrid` (small by " +
          "construction, around 0.016 for one first place and 0.033 for two). Comparable within one response and " +
          "meaningless across modes or across responses, so rank by position rather than thresholding on it."
      ),
    url: z.string().url().optional(),
  })
  .describe("One matching chunk.");
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchFilesResponseSchema = z
  .object({ hits: z.array(searchHitSchema) })
  .describe("Ranked chunks, best first.");
export type SearchFilesResponse = z.infer<typeof searchFilesResponseSchema>;

// ── Retrieval: passages ─────────────────────────────────────────────────────
export const retrieveFilesInputSchema = z
  .object({
    query: queryField,
    topK: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Chunks fetched before assembly. Default 12."),
    expand: z
      .enum(["none", "neighbors", "section"])
      .optional()
      .describe(
        "Widen each hit with surrounding text before merging: `neighbors` adds the adjacent chunks, `section` adds the hit's whole heading section. Default `none`."
      ),
    maxTokens: z
      .number()
      .int()
      .min(256)
      .max(32_000)
      .optional()
      .describe("Token budget for the assembled passages. Default 4000."),
    ...searchScopeFields,
  })
  .describe(
    "Search, widen, merge overlapping ranges, then cut to a token budget. What you want when the answer spans more than one chunk."
  );
export type RetrieveFilesInput = z.infer<typeof retrieveFilesInputSchema>;

export const passageSchema = z
  .object({
    fileId: z.string().uuid(),
    fileName: z.string(),
    text: z.string().describe("Merged text of the chunks this passage covers."),
    heading: z.string().nullable(),
    pageStart: z.number().int().positive().nullable(),
    pageEnd: z.number().int().positive().nullable(),
    score: z
      .number()
      .describe(
        "Best hit score inside this passage, on whichever scale `mode` implies. See `SearchHit.score`."
      ),
    url: z.string().url().optional(),
  })
  .describe("A contiguous run of a document, assembled from one or more hits.");
export type Passage = z.infer<typeof passageSchema>;

export const retrieveFilesResponseSchema = z
  .object({ passages: z.array(passageSchema) })
  .describe("Assembled passages, best first, inside the token budget.");
export type RetrieveFilesResponse = z.infer<typeof retrieveFilesResponseSchema>;

// ── Retrieval: formatted context ────────────────────────────────────────────
export const contextSourceSchema = z
  .object({
    index: z
      .number()
      .int()
      .positive()
      .describe("The marker this source carries in `context`, 1-based."),
    fileId: z.string().uuid(),
    fileName: z.string(),
    heading: z.string().nullable(),
    page: z.number().int().positive().nullable(),
    url: z.string().url().optional(),
  })
  .describe("One cited source behind a formatted context block.");
export type ContextSource = z.infer<typeof contextSourceSchema>;

export const contextFilesResponseSchema = z
  .object({
    context: z
      .string()
      .describe(
        "The passages as one block, each prefixed with its `[n]` source marker."
      ),
    sources: z.array(contextSourceSchema),
  })
  .describe(
    "Retrieval formatted for a prompt, with the citations kept separately."
  );
export type ContextFilesResponse = z.infer<typeof contextFilesResponseSchema>;

// ── Retrieval: grounded answer ──────────────────────────────────────────────
export const askFilesInputSchema = retrieveFilesInputSchema
  .omit({ query: true })
  .extend({
    question: queryField.describe(
      "The question to answer from the indexed documents."
    ),
    instructions: z
      .string()
      .max(2000)
      .optional()
      .describe("Extra guidance appended to the grounded-answer prompt."),
  })
  .describe("Retrieve, then answer from what was retrieved and nothing else.");
export type AskFilesInput = z.infer<typeof askFilesInputSchema>;

export const askFilesResponseSchema = contextFilesResponseSchema
  .extend({
    answer: z
      .string()
      .describe(
        "Grounded answer. When retrieval found nothing, this says so rather than answering from the model's own knowledge."
      ),
  })
  .describe("An answer plus the context and sources it was built from.");
export type AskFilesResponse = z.infer<typeof askFilesResponseSchema>;
