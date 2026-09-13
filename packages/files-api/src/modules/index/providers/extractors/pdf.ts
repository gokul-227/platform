/**
 * PDF: OCR when configured, the text layer via `unpdf` otherwise.
 *
 * Every PDF goes through OCR, not only scanned ones: `unpdf` returns flat
 * text, so a digital PDF yields no headings, and the heading path is what
 * embedding prefixes and `expand: "section"` respects.
 */

import { PlatformError } from "@aec-craft/platform-contracts";
import { FileIndexErrors } from "../../file.index.errors";
import {
  extractViaOcr,
  type FormatExtractor,
  type FormatExtractorDeps,
} from "./shared";

const PDF_EXTENSION = /\.pdf$/i;

/**
 * Below this average a PDF's text layer is treated as absent. A digital PDF
 * measures in the low thousands of characters per page; a scanned one near
 * zero. Without the cut, a scanned drawing set indexes as an empty document
 * and looks like a working upload that answers no query.
 */
const MIN_TEXT_LAYER_CHARS_PER_PAGE = 100;

function isPdf(contentType: string, fileName: string): boolean {
  return contentType === "application/pdf" || PDF_EXTENSION.test(fileName);
}

export function createPdfExtractor(deps: FormatExtractorDeps): FormatExtractor {
  const { ocr } = deps;
  return {
    matches: isPdf,
    supports: isPdf,
    async extract(input) {
      return ocr
        ? await extractViaOcr(
            ocr,
            input,
            "document",
            await countPages(input.data)
          )
        : await extractPdfTextLayer(input.data);
    },
  };
}

/**
 * Best-effort page count, so a document past the OCR provider's per-request
 * cap goes up in ranges. Structure parsing works on scanned PDFs too. Unknown
 * (no `unpdf`, unparseable bytes) sends the document whole, where one past
 * the cap fails with the provider's refusal, which is the pre-split behaviour.
 */
async function countPages(data: Uint8Array): Promise<number | undefined> {
  try {
    const unpdf = await import("unpdf");
    // pdf.js takes ownership of the bytes it is handed; count on a copy so
    // the caller's buffer stays intact.
    const { numPages } = await unpdf.getDocumentProxy(data.slice());
    return numPages;
  } catch {
    return;
  }
}

async function extractPdfTextLayer(
  data: Uint8Array
): Promise<{ markdown: string }> {
  let unpdf: typeof import("unpdf");
  try {
    unpdf = await import("unpdf");
  } catch {
    throw new PlatformError(
      FileIndexErrors.UNSUPPORTED_CONTENT_TYPE,
      'PDF extraction needs the optional "unpdf" dependency on the deployment that runs ingestion'
    );
  }
  const { text } = await unpdf.extractText(await unpdf.getDocumentProxy(data), {
    mergePages: false,
  });
  const pages = (Array.isArray(text) ? text : [text]).map((page) =>
    String(page).trim()
  );

  const characters = pages.reduce((sum, page) => sum + page.length, 0);
  if (characters < MIN_TEXT_LAYER_CHARS_PER_PAGE * pages.length) {
    throw new PlatformError(
      FileIndexErrors.UNSUPPORTED_CONTENT_TYPE,
      `The PDF's text layer is empty or nearly so (${characters} characters over ${pages.length} page(s)) — likely a scanned document, which needs OCR that this deployment has not configured`
    );
  }

  return {
    markdown: pages
      .map((page, position) => `<!-- page:${position + 1} -->\n${page}`)
      .join("\n\n"),
  };
}
