/**
 * A chunk is the right unit to rank and the wrong one to read: the sentence that
 * answers often sits beside the one that matched. Expansion re-chunks the stored
 * text, landing on the boundaries the vectors came from, and overlapping ranges
 * in one file merge rather than returning near-copies.
 */

import type { ContextSource, Passage } from "@aec-craft/platform-contracts";

import { approxTokens } from "./chunker";
import type { DocumentChunk, VectorHit } from "./file.index.seams";

export type ExpandMode = "none" | "neighbors" | "section";

/** A document's chunks, reconstructed from its stored text. */
export interface DocumentChunks {
  chunks: DocumentChunk[];
  fileName: string;
}

interface ChunkRange {
  end: number;
  score: number;
  start: number;
}

export function buildPassages(
  hits: VectorHit[],
  documents: Map<string, DocumentChunks>,
  expand: ExpandMode
): Passage[] {
  const passages: Passage[] = [];
  const rangesByFile = new Map<string, ChunkRange[]>();

  for (const hit of hits) {
    const document = expand === "none" ? undefined : documents.get(hit.fileId);
    // Nothing to widen against: the document has no stored text, or it was
    // re-chunked into fewer pieces than the vectors remember.
    if (!document || hit.chunkIndex >= document.chunks.length) {
      passages.push({
        fileId: hit.fileId,
        fileName: hit.fileName,
        text: hit.text,
        heading: hit.heading,
        pageStart: hit.page,
        pageEnd: hit.page,
        score: hit.score,
      });
      continue;
    }

    let start = hit.chunkIndex;
    let end = hit.chunkIndex;
    if (expand === "neighbors") {
      start = Math.max(0, hit.chunkIndex - 1);
      end = Math.min(document.chunks.length - 1, hit.chunkIndex + 1);
    } else {
      const heading = document.chunks[hit.chunkIndex]?.heading;
      while (start > 0 && document.chunks[start - 1]?.heading === heading) {
        start--;
      }
      while (
        end < document.chunks.length - 1 &&
        document.chunks[end + 1]?.heading === heading
      ) {
        end++;
      }
    }
    const ranges = rangesByFile.get(hit.fileId) ?? [];
    ranges.push({ start, end, score: hit.score });
    rangesByFile.set(hit.fileId, ranges);
  }

  for (const [fileId, ranges] of rangesByFile) {
    const document = documents.get(fileId);
    if (!document) {
      continue;
    }
    ranges.sort((a, b) => a.start - b.start);
    const merged: ChunkRange[] = [];
    for (const range of ranges) {
      const last = merged.at(-1);
      // Adjacent counts as overlapping: two consecutive ranges read as one run.
      if (last && range.start <= last.end + 1) {
        last.end = Math.max(last.end, range.end);
        last.score = Math.max(last.score, range.score);
      } else {
        merged.push({ ...range });
      }
    }
    for (const range of merged) {
      const chunks = document.chunks.slice(range.start, range.end + 1);
      const pages = chunks
        .map((chunk) => chunk.page)
        .filter((page): page is number => page !== undefined);
      passages.push({
        fileId,
        fileName: document.fileName,
        text: chunks.map((chunk) => chunk.text).join("\n\n"),
        heading: chunks[0]?.heading ?? null,
        pageStart: pages.length > 0 ? Math.min(...pages) : null,
        pageEnd: pages.length > 0 ? Math.max(...pages) : null,
        score: range.score,
      });
    }
  }

  return passages.sort((a, b) => b.score - a.score);
}

/**
 * Cut to a token budget in rank order. The best passage always survives, even
 * when it alone exceeds the budget: answering from a truncated best match beats
 * answering from nothing.
 */
export function budgetPassages(
  passages: Passage[],
  maxTokens: number
): Passage[] {
  const kept: Passage[] = [];
  let used = 0;
  for (const passage of passages) {
    const cost = approxTokens(passage.text);
    if (kept.length === 0 && cost > maxTokens) {
      kept.push({ ...passage, text: passage.text.slice(0, maxTokens * 4) });
      break;
    }
    if (used + cost > maxTokens) {
      continue;
    }
    kept.push(passage);
    used += cost;
  }
  return kept;
}

/** One prompt-ready string with `[n]` markers, and the citations behind them. */
export function formatContext(passages: Passage[]): {
  context: string;
  sources: ContextSource[];
} {
  const sources: ContextSource[] = passages.map((passage, position) => ({
    index: position + 1,
    fileId: passage.fileId,
    fileName: passage.fileName,
    page: passage.pageStart,
    heading: passage.heading,
    ...(passage.url === undefined ? {} : { url: passage.url }),
  }));

  const context = passages
    .map((passage, position) => {
      const locator = [describePages(passage), passage.heading]
        .filter(Boolean)
        .join(", ");
      const suffix = locator ? ` (${locator})` : "";
      return `[${position + 1}] ${passage.fileName}${suffix}\n${passage.text}`;
    })
    .join("\n\n");

  return { context, sources };
}

function describePages(passage: Passage): string | null {
  if (passage.pageStart === null) {
    return null;
  }
  if (passage.pageEnd !== null && passage.pageEnd !== passage.pageStart) {
    return `pp.${passage.pageStart}-${passage.pageEnd}`;
  }
  return `p.${passage.pageStart}`;
}
