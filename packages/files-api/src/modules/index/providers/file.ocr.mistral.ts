/**
 * Two routes to one engine: Mistral's own API with their key, or the same model
 * through Vertex Model Garden, which takes no key, bills on the Google invoice
 * and keeps the call inside Google's network. The bodies are identical, because
 * `rawPredict` passes the provider's payload through untouched.
 *
 * Either route sends the object's signed read URL rather than its bytes, so the
 * URL has to be fetchable from wherever the model is served. Pages become the
 * `<!-- page:N -->` markers the text-layer path emits.
 *
 * The provider caps pages per request, so a longer document is OCR'd in
 * sequential ranges and reassembled with absolute page markers. One failed range
 * fails the document, because a hole in a statute is invisible downstream.
 */

import { PlatformError } from "@aec-craft/platform-contracts";
import { linkFigures } from "../figures";
import { FileIndexErrors } from "../file.index.errors";
import type { ExtractedFigure } from "../file.index.seams";
import { createVertexAuth, type VertexAuthOptions } from "./vertex-auth";

interface OcrOptions {
  fetch?: typeof globalThis.fetch;
  /** Request embedded images and link them; on iff the deployment captions. */
  figures?: boolean;
  /**
   * The provider refuses requests past this many pages; documents known to be
   * longer are OCR'd in ranges of this size. Default 30, Mistral's current
   * cap; raise it when the provider does.
   */
  maxPagesPerRequest?: number;
  /** Default "mistral-ocr-latest". */
  model?: string;
}

export interface MistralOcrOptions extends OcrOptions {
  apiKey: string;
  /** Default https://api.mistral.ai */
  baseUrl?: string;
}

export interface VertexMistralOcrOptions extends OcrOptions, VertexAuthOptions {
  /**
   * Model Garden serves this model in a short list of regions rather than
   * everywhere Gemini is, and the choice decides where the pages are processed.
   * Measured against a real project: us-central1 and europe-west4 answer, while
   * europe-west1 and the global endpoint 404. Default europe-west4, the EU one.
   */
  location?: string;
}

export interface MistralOcr {
  /** `url` must be fetchable from wherever the model runs; signed read URLs are. */
  process(input: {
    /**
     * Total pages, when the caller could count them. Documents past the
     * per-request cap are OCR'd in page ranges; without a count they go up
     * whole, and one past the cap fails with the provider's refusal.
     */
    pageCount?: number;
    type: "document" | "image";
    url: string;
  }): Promise<{ markdown: string; figures?: ExtractedFigure[] }>;
}

/** Where one request goes and what authorizes it. The payload never varies. */
type OcrRoute = () => Promise<{ token: string; url: string }>;

interface OcrPage {
  images?: { id?: string; image_base64?: string }[];
  index?: number;
  markdown?: string;
}

const TRAILING_SLASH = /\/$/;
const DEFAULT_MODEL = "mistral-ocr-latest";
/** Model Garden addresses a pinned version; there is no `-latest` alias there. */
const DEFAULT_VERTEX_MODEL = "mistral-ocr-2505";
const DEFAULT_VERTEX_LOCATION = "europe-west4";

/**
 * Figure placeholders Mistral leaves inline, e.g. `![img-0.jpeg](img-0.jpeg)`.
 * Without figures the images behind them are never fetched, so the refs are
 * dead links that would index as noise. External image URLs are left alone.
 */
const FIGURE_PLACEHOLDER = /!\[[^\]]*\]\((?!https?:\/\/)[^)]*\)/g;

/** Mistral returns either a bare base64 string or a data URI. */
const DATA_URI = /^data:([^;]+);base64,(.*)$/s;

function decodeFigure(raw: string): { contentType: string; data: Uint8Array } {
  const dataUri = DATA_URI.exec(raw);
  return {
    contentType: dataUri?.[1] ?? "image/jpeg",
    data: new Uint8Array(Buffer.from(dataUri?.[2] ?? raw, "base64")),
  };
}

/** 0-based page indices of one request, `pages`-parameter shaped. */
function pageRanges(pageCount: number, cap: number): number[][] {
  const ranges: number[][] = [];
  for (let start = 0; start < pageCount; start += cap) {
    const length = Math.min(cap, pageCount - start);
    ranges.push(Array.from({ length }, (_, offset) => start + offset));
  }
  return ranges;
}

/**
 * Figure ids restart per request (`img-0.jpeg` again in every range), and an
 * id is both the derived object's key and the `figure://` ref in stored
 * markdown, so a collision overwrites one range's image with another's. Prefix
 * ids and their markdown refs with the range so they stay unique documentwide.
 */
function namespaceFigures(pages: OcrPage[], prefix: string): OcrPage[] {
  return pages.map((page) => {
    let markdown = page.markdown ?? "";
    const images = (page.images ?? []).map((image) => {
      if (!image.id) {
        return image;
      }
      const id = prefix + image.id;
      markdown = markdown.replaceAll(`](${image.id})`, `](${id})`);
      return { ...image, id };
    });
    return { ...page, markdown, images };
  });
}

/**
 * A ranged response numbers its pages from the subset, restarting at 0; rebase
 * to the document so markers and figure pages stay absolute. A provider that
 * answers with document indices lands at or past the range start and is kept
 * as-is: the two cannot collide, since a subset index is always below the
 * cap and every range after the first starts at or past it.
 */
function absolutePageIndex(
  page: OcrPage,
  position: number,
  rangeStart: number
): number {
  const index = page.index ?? position;
  return index >= rangeStart ? index : rangeStart + index;
}

function createOcr(
  route: OcrRoute,
  model: string,
  options: OcrOptions
): MistralOcr {
  const doFetch = options.fetch ?? globalThis.fetch;
  const wantsFigures = options.figures === true;
  const maxPagesPerRequest = options.maxPagesPerRequest ?? 30;

  // The route is resolved per request: a long document is many requests, and
  // the Vertex token minted for the first can expire before the last.
  async function requestPages(
    document: Record<string, string>,
    range?: number[]
  ): Promise<OcrPage[]> {
    const { token, url } = await route();
    const response = await doFetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        document,
        ...(range ? { pages: range } : {}),
        ...(wantsFigures ? { include_image_base64: true } : {}),
      }),
    });
    if (!response.ok) {
      throw new PlatformError(
        FileIndexErrors.EXTRACTION_FAILED,
        `Mistral OCR answered ${response.status}: ${(
          await response.text()
        ).slice(0, 300)}`
      );
    }
    const body = (await response.json()) as { pages?: OcrPage[] };
    return body.pages ?? [];
  }

  return {
    async process(input) {
      const document =
        input.type === "image"
          ? { type: "image_url", image_url: input.url }
          : { type: "document_url", document_url: input.url };

      // One whole-document request unless the caller counted past the cap.
      // Ranges run sequentially, because a 500-page norm fanned out in parallel
      // trips provider rate limits, and a failed range throws here, so a
      // document never indexes with a silent hole in it.
      const ranges =
        input.type === "document" &&
        input.pageCount !== undefined &&
        input.pageCount > maxPagesPerRequest
          ? pageRanges(input.pageCount, maxPagesPerRequest)
          : [undefined];
      const pages: { absoluteIndex: number; page: OcrPage }[] = [];
      for (const range of ranges) {
        const returned = range
          ? namespaceFigures(
              await requestPages(document, range),
              `r${range[0]}-`
            )
          : await requestPages(document);
        pages.push(
          ...returned.map((page, position) => ({
            absoluteIndex: absolutePageIndex(page, position, range?.[0] ?? 0),
            page,
          }))
        );
      }

      const figures: ExtractedFigure[] = [];
      if (wantsFigures) {
        for (const { absoluteIndex, page } of pages) {
          for (const image of page.images ?? []) {
            if (!(image.id && image.image_base64)) {
              continue;
            }
            figures.push({
              id: image.id,
              ...decodeFigure(image.image_base64),
              page: absoluteIndex + 1,
            });
          }
        }
      }

      const markdown = pages
        .map(({ absoluteIndex, page }) => {
          const text = wantsFigures
            ? linkFigures(page.markdown ?? "", figures)
            : (page.markdown ?? "").replace(FIGURE_PLACEHOLDER, "");
          return `<!-- page:${absoluteIndex + 1} -->\n${text.trim()}`;
        })
        .join("\n\n");

      return wantsFigures ? { markdown, figures } : { markdown };
    },
  };
}

export function createMistralOcr(options: MistralOcrOptions): MistralOcr {
  const base = (options.baseUrl ?? "https://api.mistral.ai").replace(
    TRAILING_SLASH,
    ""
  );
  return createOcr(
    () => Promise.resolve({ token: options.apiKey, url: `${base}/v1/ocr` }),
    options.model ?? DEFAULT_MODEL,
    options
  );
}

/**
 * The same engine through Vertex Model Garden. `rawPredict` is the passthrough
 * endpoint, so only the address and the credential differ; the token is minted
 * per call because ADC tokens expire.
 */
export function createVertexMistralOcr(
  options: VertexMistralOcrOptions
): MistralOcr {
  const location = options.location ?? DEFAULT_VERTEX_LOCATION;
  const model = options.model ?? DEFAULT_VERTEX_MODEL;
  const auth = createVertexAuth(options);
  return createOcr(
    async () => {
      const { token, project } = await auth();
      return {
        token,
        url: `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/mistralai/models/${model}:rawPredict`,
      };
    },
    model,
    options
  );
}
