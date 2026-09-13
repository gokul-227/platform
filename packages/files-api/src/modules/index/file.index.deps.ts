/**
 * The extractor and chunker exist unconditionally, and `supports()` decides
 * whether a file can be indexed. The embedder and vector store are null where a
 * deployment configured none, which is what makes the endpoints answer 503.
 */

import type { Config } from "../../config/config";
import type { Database } from "../../database/database.module";

import { createStructureChunker } from "./chunker";
import type { FileIndexDeps } from "./file.index.seams";
import { createVertexAnswerer } from "./providers/file.answerer.vertex";
import { createVertexCaptioner } from "./providers/file.captioner.vertex";
import { createVertexEmbedder } from "./providers/file.embedder.vertex";
import { createDefaultExtractor } from "./providers/file.extractor";
import { createPineconeLexicalStore } from "./providers/file.lexical.pinecone";
import { createPostgresLexicalStore } from "./providers/file.lexical.postgres";
import {
  createMistralOcr,
  createVertexMistralOcr,
  type MistralOcr,
} from "./providers/file.ocr.mistral";
import { createPineconeVectorStore } from "./providers/file.vector.pinecone";

export function createFileIndexDeps(
  config: Config,
  /** Needed by the Postgres lexical store; unused by the others. */
  db: Database
): FileIndexDeps {
  const index = config.documentIndex;
  // Figure bytes are only worth fetching when something captions them.
  const figures: { figures?: true } = index?.captioner ? { figures: true } : {};
  const ocr = ocrFor(index?.ocr, figures);
  const base = {
    extractor: createDefaultExtractor(ocr ? { ocr } : {}),
    chunker: createStructureChunker(),
  };

  if (!index) {
    return {
      ...base,
      embedder: null,
      vectorStore: null,
      answerer: null,
      lexicalStore: null,
      captioner: null,
    };
  }

  const { embedder, vectorStore, answerer, lexicalStore } = index;
  return {
    ...base,
    embedder: createVertexEmbedder({
      location: embedder.location,
      model: embedder.model,
      dimensions: embedder.dimensions,
      ...(embedder.projectId ? { projectId: embedder.projectId } : {}),
      ...(embedder.credentials ? { credentials: embedder.credentials } : {}),
    }),
    vectorStore: createPineconeVectorStore({
      apiKey: vectorStore.apiKey,
      indexHost: vectorStore.indexHost,
    }),
    lexicalStore: lexicalStoreFor(lexicalStore, vectorStore.apiKey, db),
    answerer: answerer
      ? createVertexAnswerer({
          model: answerer.model,
          location: answerer.location,
          ...(embedder.projectId ? { projectId: embedder.projectId } : {}),
          ...(embedder.credentials
            ? { credentials: embedder.credentials }
            : {}),
        })
      : null,
    captioner: index.captioner
      ? createVertexCaptioner({
          model: index.captioner.model,
          location: index.captioner.location,
          ...(embedder.projectId ? { projectId: embedder.projectId } : {}),
          ...(embedder.credentials
            ? { credentials: embedder.credentials }
            : {}),
        })
      : null,
  };
}

/** The lexical half, or nothing when the deployment configured none. */
function lexicalStoreFor(
  lexical: NonNullable<Config["documentIndex"]>["lexicalStore"],
  denseApiKey: string,
  db: Database
): FileIndexDeps["lexicalStore"] {
  if (!lexical) {
    return null;
  }
  if (lexical.provider === "postgres") {
    return createPostgresLexicalStore({ db });
  }
  return createPineconeLexicalStore({
    apiKey: lexical.apiKey ?? denseApiKey,
    indexHost: lexical.indexHost,
  });
}

/** One engine either way; the route decides the address and the credential. */
function ocrFor(
  config: NonNullable<Config["documentIndex"]>["ocr"],
  figures: { figures?: true }
): MistralOcr | undefined {
  if (!config) {
    return;
  }
  if (config.provider === "mistralVertex") {
    return createVertexMistralOcr({
      location: config.location,
      model: config.model,
      maxPagesPerRequest: config.maxPagesPerRequest,
      ...(config.projectId ? { projectId: config.projectId } : {}),
      ...figures,
    });
  }
  return createMistralOcr({
    apiKey: config.apiKey,
    model: config.model,
    maxPagesPerRequest: config.maxPagesPerRequest,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...figures,
  });
}
