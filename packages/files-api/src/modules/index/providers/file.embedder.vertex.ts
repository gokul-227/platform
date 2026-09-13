/**
 * Two provider facts: gemini-embedding-001 accepts one instance per request, so
 * a batch is parallel requests rather than one call, and any dimensionality
 * below 3072 comes back un-normalized, so cosine similarity misbehaves unless it
 * is re-normalized here.
 *
 * Document and query text embed with different task types, which is why the two
 * entry points are not one: skipping it costs retrieval quality.
 */

import { InternalErrors, PlatformError } from "@aec-craft/platform-contracts";
import type { Embedder } from "../file.index.seams";
import { createVertexAuth, type VertexAuthOptions } from "./vertex-auth";

export interface VertexEmbedderOptions extends VertexAuthOptions {
  /** Parallel predict requests while embedding a document. Default 8. */
  concurrency?: number;
  /** Output dimensionality. Must equal the vector index's. Default 768. */
  dimensions?: number;
  fetch?: typeof globalThis.fetch;
  /** Vertex region. Default "europe-west3". */
  location?: string;
  /** Default "gemini-embedding-001". */
  model?: string;
}

const DEFAULT_LOCATION = "europe-west3";
const DEFAULT_MODEL = "gemini-embedding-001";
const DEFAULT_DIMENSIONS = 768;
const DEFAULT_CONCURRENCY = 8;

function normalize(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) {
    sumOfSquares += value * value;
  }
  const norm = Math.sqrt(sumOfSquares);
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

export function createVertexEmbedder(
  options: VertexEmbedderOptions = {}
): Embedder {
  const location = options.location ?? DEFAULT_LOCATION;
  const model = options.model ?? DEFAULT_MODEL;
  const dimensions = options.dimensions ?? DEFAULT_DIMENSIONS;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const doFetch = options.fetch ?? globalThis.fetch;
  const auth = createVertexAuth(options);

  async function predict(text: string, taskType: string): Promise<number[]> {
    const { token, project } = await auth();
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:predict`;
    const response = await doFetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ content: text, task_type: taskType }],
        parameters: { outputDimensionality: dimensions, autoTruncate: true },
      }),
    });
    if (!response.ok) {
      throw new PlatformError(
        InternalErrors.UNEXPECTED,
        `Vertex embeddings answered ${response.status}: ${(
          await response.text()
        ).slice(0, 300)}`
      );
    }
    const body = (await response.json()) as {
      predictions?: { embeddings?: { values?: number[] } }[];
    };
    const values = body.predictions?.[0]?.embeddings?.values;
    if (!values || values.length !== dimensions) {
      throw new PlatformError(
        InternalErrors.UNEXPECTED,
        `Vertex embeddings returned ${values?.length ?? 0} values, expected ${dimensions}`
      );
    }
    return normalize(values);
  }

  return {
    dimensions,

    async embedDocuments(texts: string[]): Promise<number[][]> {
      const embeddings: number[][] = new Array(texts.length);
      let next = 0;
      const workers = Array.from(
        { length: Math.min(concurrency, texts.length) },
        async () => {
          while (next < texts.length) {
            const position = next++;
            embeddings[position] = await predict(
              texts[position] as string,
              "RETRIEVAL_DOCUMENT"
            );
          }
        }
      );
      await Promise.all(workers);
      return embeddings;
    },

    embedQuery(text: string): Promise<number[]> {
      return predict(text, "RETRIEVAL_QUERY");
    },
  };
}
