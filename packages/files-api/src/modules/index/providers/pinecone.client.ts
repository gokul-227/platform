/**
 * Shared by the dense and sparse stores so the authorization filter is built
 * once: hybrid retrieval queries two indexes, and two `groupId` predicates could
 * disagree, which reads as the lexical half returning what the semantic half
 * would not.
 *
 * Vector ids are `${fileId}#${chunkIndex}` in both indexes, so a document's
 * vectors enumerate by prefix and the rankings fuse without a lookup. Serverless
 * cannot delete by metadata filter, so a reindex is list-then-delete.
 *
 * A delete is acknowledged one to two seconds before a query stops returning it
 * (measured against a real index; the emulator is synchronous), so a search can
 * briefly surface superseded chunks. It converges, and ids overwrite rather than
 * duplicate, but a caller that must not see one cannot read this store alone.
 */

import { InternalErrors, PlatformError } from "@aec-craft/platform-contracts";
import type { VectorQuery } from "../file.index.seams";

const API_VERSION = "2025-01";
/**
 * Pinecone caps an upsert at 2 MB, so batches are measured rather than counted:
 * a count safe for prose is over the limit for a coarsely chunked document.
 * Budgeted well clear, because the failure is a 413 that loses a document's
 * embedding work after paying for all of it.
 */
const MAX_UPSERT_BYTES = 1_500_000;
const DELETE_BATCH = 1000;
const LIST_PAGE = 100;
/** Attribute keys are namespaced in metadata so callers cannot shadow ours. */
export const ATTRIBUTE_PREFIX = "attr_";
/** Callers may paste the host with or without a scheme and trailing slash. */
const EXPLICIT_SCHEME = /^https?:\/\//;
const TRAILING_SLASH = /\/$/;

export type Scalar = string | number | boolean;

export interface PineconeIndexOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  /** The index's data-plane host. A bare host gets https; a scheme is honoured. */
  indexHost: string;
}

/**
 * A bare host gets https, because that is every hosted index. An explicit scheme
 * is honoured, which is what lets the local emulator (plain HTTP on a localhost
 * port) be addressed by the same driver as production.
 */
function baseUrlOf(indexHost: string): string {
  const trimmed = indexHost.replace(TRAILING_SLASH, "");
  return EXPLICIT_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export interface PineconeMatch {
  id: string;
  metadata?: Record<string, unknown>;
  score: number;
}

export class PineconeIndex {
  private readonly base: string;
  private readonly doFetch: typeof globalThis.fetch;

  constructor(private readonly options: PineconeIndexOptions) {
    this.base = baseUrlOf(options.indexHost);
    this.doFetch = options.fetch ?? globalThis.fetch;
  }

  async call<T>(
    path: string,
    init: { method: string; body?: unknown }
  ): Promise<T> {
    const response = await this.doFetch(`${this.base}${path}`, {
      method: init.method,
      headers: {
        "Api-Key": this.options.apiKey,
        "X-Pinecone-Api-Version": API_VERSION,
        "content-type": "application/json",
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    if (!response.ok) {
      throw new PlatformError(
        InternalErrors.UNEXPECTED,
        `Pinecone ${init.method} ${path} answered ${response.status}: ${(
          await response.text()
        ).slice(0, 300)}`
      );
    }
    return (await response.json().catch(() => ({}))) as T;
  }

  async listIds(namespace: string, prefix: string): Promise<string[]> {
    const ids: string[] = [];
    let token: string | undefined;
    do {
      const query = new URLSearchParams({
        namespace,
        prefix,
        limit: String(LIST_PAGE),
      });
      if (token) {
        query.set("paginationToken", token);
      }
      const page = await this.call<{
        vectors?: { id: string }[];
        pagination?: { next?: string };
      }>(`/vectors/list?${query}`, { method: "GET" });
      for (const vector of page.vectors ?? []) {
        ids.push(vector.id);
      }
      token = page.pagination?.next;
    } while (token);
    return ids;
  }

  /** Replace semantics: a re-indexed document may be shorter than before. */
  async deleteByPrefix(namespace: string, fileId: string): Promise<void> {
    const ids = await this.listIds(namespace, `${fileId}#`);
    for (let start = 0; start < ids.length; start += DELETE_BATCH) {
      await this.call("/vectors/delete", {
        method: "POST",
        body: { ids: ids.slice(start, start + DELETE_BATCH), namespace },
      });
    }
  }

  /**
   * Upsert every vector, in as few requests as the size limit allows. Takes the
   * whole document rather than a caller-chosen slice, so the one place that knows
   * the wire constraint is the one that enforces it.
   */
  async upsert(namespace: string, vectors: unknown[]): Promise<void> {
    let batch: unknown[] = [];
    let bytes = 0;
    for (const vector of vectors) {
      const size = Buffer.byteLength(JSON.stringify(vector));
      if (batch.length > 0 && bytes + size > MAX_UPSERT_BYTES) {
        await this.sendUpsert(namespace, batch);
        batch = [];
        bytes = 0;
      }
      // A single vector over budget still has to go: rejecting it would drop a
      // chunk silently, and the server's answer is the honest verdict on it.
      batch.push(vector);
      bytes += size;
    }
    if (batch.length > 0) {
      await this.sendUpsert(namespace, batch);
    }
  }

  private async sendUpsert(
    namespace: string,
    vectors: unknown[]
  ): Promise<void> {
    await this.call("/vectors/upsert", {
      method: "POST",
      body: { vectors, namespace },
    });
  }

  async query(body: Record<string, unknown>): Promise<PineconeMatch[]> {
    const response = await this.call<{ matches?: PineconeMatch[] }>("/query", {
      method: "POST",
      body,
    });
    return response.matches ?? [];
  }
}

/**
 * The authorization filter, built once for whichever index is being queried.
 *
 * Both halves are required and neither implies the other: an org-wide group is
 * readable from every project in the org, so a group filter alone would answer a
 * search in one project with another project's documents.
 */
export function accessFilter(query: VectorQuery): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [
    { groupId: { $in: query.groupIds } },
    partitionFilter(query),
  ];
  for (const [key, value] of Object.entries(query.filter ?? {})) {
    conditions.push({ [`${ATTRIBUTE_PREFIX}${key}`]: { $eq: value } });
  }
  return conditions.length === 1
    ? (conditions[0] as Record<string, unknown>)
    : { $and: conditions };
}

/**
 * The partition half. Org-library documents carry no `projectId` at all, so
 * absence is what identifies the library.
 */
function partitionFilter(query: VectorQuery): Record<string, unknown> {
  const library = { projectId: { $exists: false } };
  if (query.projectId === null) {
    return library;
  }
  const project = { projectId: { $eq: query.projectId } };
  return query.includeOrgLibrary ? { $or: [project, library] } : project;
}

/** One match, mapped back to a hit. Identical for both indexes. */
export function toHit(match: PineconeMatch): {
  chunkIndex: number;
  fileId: string;
  fileName: string;
  heading: string | null;
  page: number | null;
  score: number;
  text: string;
} {
  const metadata = match.metadata ?? {};
  return {
    fileId: String(metadata.fileId ?? match.id.split("#")[0]),
    fileName: String(metadata.fileName ?? ""),
    chunkIndex: Number(metadata.chunkIndex ?? match.id.split("#")[1] ?? 0),
    text: String(metadata.text ?? ""),
    heading: metadata.heading == null ? null : String(metadata.heading),
    page: metadata.page == null ? null : Number(metadata.page),
    score: match.score,
  };
}

export function prefixAttributes(
  attributes: Record<string, Scalar>
): Record<string, Scalar> {
  const prefixed: Record<string, Scalar> = {};
  for (const [key, value] of Object.entries(attributes)) {
    prefixed[`${ATTRIBUTE_PREFIX}${key}`] = value;
  }
  return prefixed;
}
