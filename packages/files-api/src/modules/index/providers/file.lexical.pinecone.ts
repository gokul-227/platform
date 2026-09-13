/**
 * A second index rather than sparse values on the dense one: serverless keeps
 * sparse vectors in an index of their own and a dense index rejects them.
 * Sparse-dense in one index was the pod-based feature.
 *
 * Everything else is the dense store's: the namespace, the vector ids, and the
 * access filter, built once so the two halves cannot disagree.
 */

import type {
  LexicalChunk,
  LexicalQuery,
  LexicalStore,
  VectorHit,
} from "../file.index.seams";

import { createSparseEncoder } from "../sparse-encoder";

import { metadataOf } from "./file.vector.pinecone";
import {
  accessFilter,
  PineconeIndex,
  type PineconeIndexOptions,
  toHit,
} from "./pinecone.client";

export type PineconeLexicalStoreOptions = PineconeIndexOptions;

export function createPineconeLexicalStore(
  options: PineconeLexicalStoreOptions
): LexicalStore {
  const index = new PineconeIndex(options);
  // The encoder is this store's business: a sparse index needs explicit term
  // weights, where Postgres derives its own. Nothing outside here knows.
  const encoder = createSparseEncoder();

  return {
    async upsertDocument(orgId, fileId, chunks): Promise<void> {
      await index.deleteByPrefix(orgId, fileId);
      await index.upsert(
        orgId,
        chunks.map((chunk: LexicalChunk) => ({
          id: `${fileId}#${chunk.index}`,
          sparseValues: encoder.encodeDocument(chunk.indexedText),
          metadata: metadataOf(chunk),
        }))
      );
    },

    deleteDocument(orgId, fileId): Promise<void> {
      return index.deleteByPrefix(orgId, fileId);
    },

    async query(query: LexicalQuery): Promise<VectorHit[]> {
      if (query.groupIds.length === 0) {
        return [];
      }
      // A query whose every term was a stopword has nothing to match on. Sending
      // it would ask the index to rank by an empty vector.
      const sparse = encoder.encodeQuery(query.query);
      if (sparse.indices.length === 0) {
        return [];
      }
      const matches = await index.query({
        sparseVector: sparse,
        topK: query.topK,
        namespace: query.orgId,
        includeMetadata: true,
        filter: accessFilter({ ...query, embedding: [] }),
      });
      // A sparse index scores every candidate the filter admits, including ones
      // sharing no term with the query, which come back at zero. They are not
      // lexical matches and must not take a fusion slot.
      return matches.filter((match) => match.score > 0).map(toHit);
    },
  };
}
