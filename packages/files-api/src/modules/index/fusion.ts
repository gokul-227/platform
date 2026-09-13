/**
 * Reciprocal rank fusion: a hit scores `1 / (k + rank)` in each list and the
 * scores add. Position only, never score, because cosine similarity lives in
 * [-1, 1] while sparse term weights are unbounded, so summing the raw two lets
 * the lexical half dominate. A hit found by both halves outranks either.
 */

import type { VectorHit } from "./file.index.seams";

/**
 * 60, from the original TREC work: it flattens the top few positions, so one
 * list cannot win on its first hit alone.
 */
const RRF_K = 60;

/** A hit's identity across both indexes. Ids match, so this is exact. */
function keyOf(hit: VectorHit): string {
  return `${hit.fileId}#${hit.chunkIndex}`;
}

/**
 * Merge ranked lists into one, best first, keeping at most `topK`.
 *
 * The returned `score` is the fusion score, not a similarity: it is comparable
 * within one response and meaningless outside it. `minScore` is therefore applied
 * by the caller to the *component* rankings, before fusion, where the numbers
 * still mean something.
 */
export function fuseRankings(
  rankings: VectorHit[][],
  topK: number
): VectorHit[] {
  const scores = new Map<string, number>();
  const hits = new Map<string, VectorHit>();

  for (const ranking of rankings) {
    for (const [position, hit] of ranking.entries()) {
      const key = keyOf(hit);
      scores.set(key, (scores.get(key) ?? 0) + 1 / (RRF_K + position + 1));
      // Keep the first copy seen: both indexes carry the same metadata, and the
      // earlier list is the higher-ranked one.
      if (!hits.has(key)) {
        hits.set(key, hit);
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([key, score]) => ({ ...(hits.get(key) as VectorHit), score }));
}
