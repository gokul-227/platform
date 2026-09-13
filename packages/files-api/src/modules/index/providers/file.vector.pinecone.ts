/**
 * Tenancy is physical: the namespace is the owning org, so one org's query
 * cannot reach another's vectors even with a filter built wrong. Inside it,
 * `groupId` rides on every vector and the index applies the filter, which
 * `pinecone.client.ts` builds once for both halves of a hybrid query.
 */

import type {
  VectorChunk,
  VectorHit,
  VectorQuery,
  VectorStore,
} from "../file.index.seams";

import {
  accessFilter,
  PineconeIndex,
  type PineconeIndexOptions,
  prefixAttributes,
  toHit,
} from "./pinecone.client";

/**
 * Keeps each vector inside Pinecone's 40KB metadata budget. Default chunks
 * (256 tokens, about 1KB) never approach it; only extreme custom chunking does.
 */
const MAX_METADATA_TEXT = 9000;

export type PineconeVectorStoreOptions = PineconeIndexOptions;

export function createPineconeVectorStore(
  options: PineconeVectorStoreOptions
): VectorStore {
  const index = new PineconeIndex(options);

  return {
    async upsertDocument(orgId, fileId, chunks): Promise<void> {
      await index.deleteByPrefix(orgId, fileId);
      await index.upsert(
        orgId,
        chunks.map((chunk: VectorChunk) => ({
          id: `${fileId}#${chunk.index}`,
          values: chunk.embedding,
          metadata: metadataOf(chunk),
        }))
      );
    },

    deleteDocument(orgId, fileId): Promise<void> {
      return index.deleteByPrefix(orgId, fileId);
    },

    async query(query: VectorQuery): Promise<VectorHit[]> {
      // An empty readable set means the caller may read nothing here. Sending
      // `$in: []` would be a filter Pinecone is free to interpret loosely, so
      // the query never leaves.
      if (query.groupIds.length === 0) {
        return [];
      }
      const matches = await index.query({
        vector: query.embedding,
        topK: query.topK,
        namespace: query.orgId,
        includeMetadata: true,
        filter: accessFilter(query),
      });
      return matches.map(toHit);
    },
  };
}

/** Shared with the lexical store: the same chunk, described the same way. */
export function metadataOf(chunk: {
  fileId: string;
  fileName: string;
  index: number;
  text: string;
  heading?: string;
  page?: number;
  scope: { groupId: string; projectId: string | null };
  attributes: Record<string, string | number | boolean>;
}): Record<string, unknown> {
  return {
    fileId: chunk.fileId,
    fileName: chunk.fileName,
    chunkIndex: chunk.index,
    text: chunk.text.slice(0, MAX_METADATA_TEXT),
    groupId: chunk.scope.groupId,
    // Absent rather than null for org-library documents: Pinecone metadata has
    // no null, and `$eq: null` would match nothing.
    ...(chunk.scope.projectId === null
      ? {}
      : { projectId: chunk.scope.projectId }),
    ...(chunk.heading === undefined ? {} : { heading: chunk.heading }),
    ...(chunk.page === undefined ? {} : { page: chunk.page }),
    ...prefixAttributes(chunk.attributes),
  };
}
