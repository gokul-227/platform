/**
 * `structure` splits on headings and paragraphs first, so boundaries land where
 * the author put them, and size-caps only what is still oversized. Each chunk
 * carries its heading path, because a clause reads differently under "Fire
 * safety" than under "Acoustics", and an oversized table repeats its header
 * rows, because bare cells embed as noise.
 *
 * Deterministic on the same input, which is what lets passage expansion
 * re-chunk stored text onto the same boundaries the vectors came from. Token
 * counts are approximated as ceil(chars / 4); providers truncate anyway.
 */

import type { ChunkingOptions } from "@aec-craft/platform-contracts";

import type { Chunker, DocumentChunk } from "./file.index.seams";

/** Page marker the extractors emit. Consumed here, never embedded. */
export const PAGE_MARKER_RE = /<!--\s*page:(\d+)\s*-->/g;

const DEFAULT_MAX_TOKENS = 256;
const DEFAULT_OVERLAP = 0.2;
const CHARS_PER_TOKEN = 4;
/** Where a forced split looks for a sentence boundary: the last fifth. */
const BREAK_SEARCH_FRACTION = 0.8;
/** Paragraph break: a blank line or more. */
const PARAGRAPH_RE = /\n{2,}/;
/** An ATX heading at the start of a block, with its level and its text. */
const HEADING_RE = /^(#{1,6})\s+(.+)$/m;
/** A pipe table's separator row: only pipes, dashes, colons and spaces. */
const TABLE_SEPARATOR_RE = /^[|\s:-]+$/;

export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

interface Segment {
  heading: string | undefined;
  page: number | undefined;
  text: string;
}

/** Split markdown into heading-scoped paragraphs, tracking the current page. */
function segment(markdown: string): Segment[] {
  const out: Segment[] = [];
  const path: string[] = [];
  let page: number | undefined;

  for (const block of markdown.split(PARAGRAPH_RE)) {
    let text = block.trim();
    if (!text) {
      continue;
    }

    // A block may contain several markers: the first positions this block, the
    // last sets the page for what follows.
    let blockPage = page;
    let isFirst = true;
    text = text.replace(PAGE_MARKER_RE, (_match, digits: string) => {
      const parsed = Number(digits);
      if (isFirst) {
        blockPage = parsed;
        isFirst = false;
      }
      page = parsed;
      return "";
    });
    text = text.trim();
    if (!text) {
      continue;
    }

    const headingMatch = HEADING_RE.exec(text);
    if (headingMatch?.index === 0) {
      const level = (headingMatch[1] as string).length;
      path.length = level - 1;
      path[level - 1] = (headingMatch[2] as string).trim();
      const rest = text.slice(headingMatch[0].length).trim();
      if (!rest) {
        continue;
      }
      text = rest;
    }

    out.push({
      text,
      heading: path.length > 0 ? path.join(" > ") : undefined,
      page: blockPage,
    });
  }
  return out;
}

/** A GitHub-style pipe table: a header row, a separator row, data rows. */
function isPipeTable(text: string): boolean {
  const lines = text.split("\n");
  const header = lines[0]?.trimStart();
  const separator = lines[1] ?? "";
  return (
    lines.length >= 3 &&
    header?.startsWith("|") === true &&
    TABLE_SEPARATOR_RE.test(separator) &&
    separator.includes("---")
  );
}

/**
 * Split an oversized table at row boundaries, repeating the header and
 * separator rows in every window. No overlap: the repeated header is the
 * context carrier, and half a row helps nobody. A single row wider than the
 * cap ships whole; embedding providers truncate on their own.
 */
function splitTableRows(text: string, maxChars: number): string[] {
  const lines = text.split("\n");
  const header = `${lines[0]}\n${lines[1]}`;
  const windows: string[] = [];
  let rows: string[] = [];
  let size = header.length;

  const flush = (): void => {
    if (rows.length > 0) {
      windows.push(`${header}\n${rows.join("\n")}`);
      rows = [];
      size = header.length;
    }
  };

  for (const row of lines.slice(2)) {
    if (rows.length > 0 && size + row.length + 1 > maxChars) {
      flush();
    }
    rows.push(row);
    size += row.length + 1;
  }
  flush();
  return windows;
}

/** Hard-split an oversized text into overlapping windows, sentence-friendly. */
function splitWindows(
  text: string,
  maxChars: number,
  overlapChars: number
): string[] {
  if (text.length <= maxChars) {
    return [text];
  }
  const windows: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const searchFrom = start + Math.floor(maxChars * BREAK_SEARCH_FRACTION);
      const tail = text.slice(searchFrom, end);
      const breakAt = Math.max(
        tail.lastIndexOf(". "),
        tail.lastIndexOf("\n"),
        tail.lastIndexOf(" ")
      );
      if (breakAt > 0) {
        end = searchFrom + breakAt + 1;
      }
    }
    windows.push(text.slice(start, end).trim());
    if (end >= text.length) {
      break;
    }
    start = Math.max(end - overlapChars, start + 1);
  }
  return windows.filter((window) => window.length > 0);
}

function build(
  segments: Segment[],
  maxTokens: number,
  overlap: number
): DocumentChunk[] {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = Math.floor(maxChars * overlap);
  const chunks: DocumentChunk[] = [];

  let buffer: Segment[] = [];
  let bufferChars = 0;

  const flush = (): void => {
    if (buffer.length === 0) {
      return;
    }
    const first = buffer[0] as Segment;
    chunks.push({
      index: chunks.length,
      text: buffer.map((s) => s.text).join("\n\n"),
      ...(first.heading === undefined ? {} : { heading: first.heading }),
      ...(first.page === undefined ? {} : { page: first.page }),
    });
    buffer = [];
    bufferChars = 0;
  };

  for (const seg of segments) {
    const isSameHeading =
      buffer.length === 0 || (buffer[0] as Segment).heading === seg.heading;
    if (!isSameHeading || bufferChars + seg.text.length > maxChars) {
      flush();
    }

    if (seg.text.length > maxChars) {
      flush();
      const windows = isPipeTable(seg.text)
        ? splitTableRows(seg.text, maxChars)
        : splitWindows(seg.text, maxChars, overlapChars);
      for (const window of windows) {
        chunks.push({
          index: chunks.length,
          text: window,
          ...(seg.heading === undefined ? {} : { heading: seg.heading }),
          ...(seg.page === undefined ? {} : { page: seg.page }),
        });
      }
      continue;
    }

    buffer.push(seg);
    bufferChars += seg.text.length + 2;
  }
  flush();
  return chunks;
}

export function createStructureChunker(): Chunker {
  return {
    chunk(markdown: string, options?: ChunkingOptions): DocumentChunk[] {
      if (options?.strategy === "fixed") {
        return createFixedChunker().chunk(markdown, options);
      }
      return build(
        segment(markdown),
        options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        options?.overlap ?? DEFAULT_OVERLAP
      );
    },
  };
}

export function createFixedChunker(): Chunker {
  return {
    chunk(markdown: string, options?: ChunkingOptions): DocumentChunk[] {
      const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
      const overlap = options?.overlap ?? DEFAULT_OVERLAP;
      const maxChars = maxTokens * CHARS_PER_TOKEN;

      // Strip page markers, remembering which page each offset falls on.
      const pages: { offset: number; page: number }[] = [];
      let clean = "";
      let last = 0;
      for (const match of markdown.matchAll(PAGE_MARKER_RE)) {
        clean += markdown.slice(last, match.index);
        pages.push({ offset: clean.length, page: Number(match[1]) });
        last = (match.index ?? 0) + match[0].length;
      }
      clean += markdown.slice(last);

      const pageAt = (offset: number): number | undefined => {
        let current: number | undefined;
        for (const entry of pages) {
          if (entry.offset > offset) {
            break;
          }
          current = entry.page;
        }
        return current;
      };

      const windows = splitWindows(
        clean.trim(),
        maxChars,
        Math.floor(maxChars * overlap)
      );
      let cursor = 0;
      return windows.map((text, index) => {
        const at = clean.indexOf(text, cursor);
        if (at >= 0) {
          cursor = at;
        }
        const page = pageAt(Math.max(at, 0));
        return { index, text, ...(page === undefined ? {} : { page }) };
      });
    },
  };
}
