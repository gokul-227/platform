/**
 * Creates the local document index in Pinecone Local, idempotently, and prints
 * the two env vars the API needs.
 *
 * The emulator is in-memory, so this has to run again after every `down`.
 * Dimension has to match `documentIndex.embedder.dimensions`; a mismatch is
 * rejected per request rather than at boot, so both come from DIMENSIONS here.
 */

const CONTROL_PLANE =
  process.env.PINECONE_CONTROL_PLANE ?? "http://localhost:5080";
const INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? "platform-docs";
const SPARSE_INDEX_NAME =
  process.env.PINECONE_SPARSE_INDEX_NAME ?? "platform-docs-lexical";
const DIMENSIONS = Number(process.env.RAG_DIMENSIONS ?? 768);

const headers = {
  "Api-Key": "pclocal",
  "X-Pinecone-Api-Version": "2025-01",
  "content-type": "application/json",
};

interface IndexDescription {
  dimension?: number;
  host: string;
  name: string;
  vector_type?: string;
}

async function existing(name: string): Promise<IndexDescription | undefined> {
  const response = await fetch(`${CONTROL_PLANE}/indexes`, { headers });
  if (!response.ok) {
    throw new Error(
      `Pinecone Local is not answering on ${CONTROL_PLANE} (${response.status}). Run: pnpm db:index:up`
    );
  }
  const body = (await response.json()) as { indexes?: IndexDescription[] };
  return (body.indexes ?? []).find((index) => index.name === name);
}

async function create(
  body: Record<string, unknown>
): Promise<IndexDescription> {
  const response = await fetch(`${CONTROL_PLANE}/indexes`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `creating "${body.name as string}" answered ${response.status}: ${(await response.text()).slice(0, 300)}`
    );
  }
  return (await response.json()) as IndexDescription;
}

/** The dense index: cosine, because the embedder returns unit-norm vectors. */
async function denseIndex(): Promise<IndexDescription> {
  const found = await existing(INDEX_NAME);
  if (found) {
    if (found.dimension !== DIMENSIONS) {
      throw new Error(
        `index "${INDEX_NAME}" exists with dimension ${found.dimension}, not ${DIMENSIONS}. Run: pnpm db:index:down && pnpm db:index:up`
      );
    }
    return found;
  }
  return await create({
    name: INDEX_NAME,
    dimension: DIMENSIONS,
    metric: "cosine",
    spec: { serverless: { cloud: "aws", region: "us-east-1" } },
  });
}

/**
 * The lexical index: sparse, which is a separate index rather than sparse values
 * on the dense one. Serverless rejects sparse values on a dense index; putting
 * both in one index was the pod-based feature and does not carry over. No
 * dimension, and dotproduct is the only metric a sparse index takes.
 */
async function sparseIndex(): Promise<IndexDescription> {
  const found = await existing(SPARSE_INDEX_NAME);
  if (found) {
    return found;
  }
  return await create({
    name: SPARSE_INDEX_NAME,
    metric: "dotproduct",
    vector_type: "sparse",
    spec: { serverless: { cloud: "aws", region: "us-east-1" } },
  });
}

async function main(): Promise<void> {
  const dense = await denseIndex();
  const sparse = await sparseIndex();
  process.stdout.write(
    [
      `dense index  "${dense.name}" (dimension ${dense.dimension}, cosine)`,
      `sparse index "${sparse.name}" (${sparse.vector_type ?? "sparse"}, dotproduct)`,
      "",
      "Mount these on the API:",
      "  PINECONE_API_KEY=pclocal",
      `  PINECONE_INDEX_HOST=http://${dense.host}`,
      `  PINECONE_SPARSE_INDEX_HOST=http://${sparse.host}`,
      `  RAG_DIMENSIONS=${dense.dimension}`,
      "",
      "Omit PINECONE_SPARSE_INDEX_HOST for semantic-only retrieval.",
      "",
    ].join("\n")
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
