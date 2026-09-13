/**
 * Extracted images live beside their source as `{objectKey}/figures/{id}`, and
 * the markdown points at them with `figure://{id}` refs, swapped for signed URLs
 * at read time. Captions append as a `# Figures` section, so they chunk, embed
 * and expand like any other text.
 */

import type { ExtractedFigure } from "./file.index.seams";

const FIGURE_REF_RE = /figure:\/\/([^)\s"']+)/g;

export function figureObjectKey(objectKey: string, figureId: string): string {
  return `${objectKey}/figures/${figureId}`;
}

/** Figure ids referenced by stored markdown (null-safe). */
export function figureIdsFrom(markdown: string | null | undefined): string[] {
  if (!markdown) {
    return [];
  }
  const ids = new Set<string>();
  for (const match of markdown.matchAll(FIGURE_REF_RE)) {
    ids.add(match[1] as string);
  }
  return [...ids];
}

/** Rewrites the OCR placeholder `![id](id)` to a stable `figure://id` ref. */
export function linkFigures(
  markdown: string,
  figures: Pick<ExtractedFigure, "id">[]
): string {
  let out = markdown;
  for (const figure of figures) {
    out = out.replaceAll(`](${figure.id})`, `](figure://${figure.id})`);
  }
  return out;
}

/** The captions, as a markdown section the chunker treats like any other. */
export function figuresSection(
  captioned: { caption: string; id: string; page?: number }[]
): string {
  if (captioned.length === 0) {
    return "";
  }
  const entries = captioned.map(
    (figure) =>
      `${figure.page === undefined ? "" : `<!-- page:${figure.page} -->\n`}Figure ${figure.id}: ${figure.caption}`
  );
  return `\n\n# Figures\n\n${entries.join("\n\n")}`;
}
