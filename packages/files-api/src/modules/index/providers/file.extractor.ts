/**
 * Each format owns a module under `extractors/`, tried in order, first
 * `matches()` winning. The order is a contract: specific formats come before the
 * text fallback, so a misdeclared content type still routes by extension.
 *
 * Every module converges on markdown with `<!-- page:N -->` markers and ATX
 * headings, which is what lets one chunker and one store serve every format.
 */

import { PlatformError } from "@aec-craft/platform-contracts";
import { FileIndexErrors } from "../file.index.errors";
import type { ExtractInput, Extractor } from "../file.index.seams";
import { createDocxExtractor } from "./extractors/docx";
import { createIfcExtractor } from "./extractors/ifc";
import { createImageExtractor } from "./extractors/image";
import { createPdfExtractor } from "./extractors/pdf";
import { createPptxExtractor } from "./extractors/pptx";
import type { FormatExtractor } from "./extractors/shared";
import { createTextExtractor } from "./extractors/text";
import type { MistralOcr } from "./file.ocr.mistral";

export interface DefaultExtractorOptions {
  /**
   * OCR for scanned PDFs, DOCX, PPTX and images. Absent, those fail with an
   * error naming OCR as the missing piece, and only digital PDFs and plain
   * text extract.
   */
  ocr?: MistralOcr;
}

export function createDefaultExtractor(
  options: DefaultExtractorOptions = {}
): Extractor {
  const formats: FormatExtractor[] = [
    createPdfExtractor(options),
    createDocxExtractor(options),
    createPptxExtractor(options),
    createImageExtractor(options),
    createTextExtractor(),
    createIfcExtractor(),
  ];

  return {
    supports(contentType, fileName) {
      return formats.some((format) => format.supports(contentType, fileName));
    },

    async extract(input: ExtractInput) {
      const format = formats.find((candidate) =>
        candidate.matches(input.contentType, input.fileName)
      );
      if (!format) {
        throw new PlatformError(
          FileIndexErrors.UNSUPPORTED_CONTENT_TYPE,
          `Nothing here can extract text from "${input.contentType}" (${input.fileName})`
        );
      }
      return await format.extract(input);
    },
  };
}
