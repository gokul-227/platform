/**
 * `matches` and `supports` are two questions: the first claims routing, the
 * second says this deployment can extract it. They differ for an OCR-only
 * format, which matches its type always and supports it only with OCR
 * configured, so enqueue refuses it up front.
 */

import { PlatformError } from "@aec-craft/platform-contracts";
import { FileIndexErrors } from "../../file.index.errors";
import type { ExtractedFigure, ExtractInput } from "../../file.index.seams";
import type { MistralOcr } from "../file.ocr.mistral";

/** Shared dependencies, resolved once at boot; each format takes what it uses. */
export interface FormatExtractorDeps {
  ocr?: MistralOcr;
}

/** One format's slice of the default extractor. The router tries these in order. */
export interface FormatExtractor {
  extract(
    input: ExtractInput
  ): Promise<{ markdown: string; figures?: ExtractedFigure[] }>;
  matches(contentType: string, fileName: string): boolean;
  supports(contentType: string, fileName: string): boolean;
}

export function requireOcr(
  ocr: MistralOcr | undefined,
  input: ExtractInput
): asserts ocr is MistralOcr {
  if (!ocr) {
    throw new PlatformError(
      FileIndexErrors.UNSUPPORTED_CONTENT_TYPE,
      `"${input.contentType}" (${input.fileName}) needs OCR, which this deployment has not configured`
    );
  }
}

export async function extractViaOcr(
  ocr: MistralOcr,
  input: ExtractInput,
  type: "document" | "image",
  /** Lets the client split a document past the provider's per-request cap. */
  pageCount?: number
): Promise<{ markdown: string; figures?: ExtractedFigure[] }> {
  if (!input.url) {
    throw new PlatformError(
      FileIndexErrors.EXTRACTION_FAILED,
      "OCR fetches the object itself, and this extraction carried no signed read URL"
    );
  }
  return await ocr.process({
    url: input.url,
    type,
    ...(pageCount === undefined ? {} : { pageCount }),
  });
}
