/**
 * Routed through OCR for now. It is structured XML and deserves a native
 * extractor, which would land here.
 * TODO(#153): the native extractor.
 */

import {
  extractViaOcr,
  type FormatExtractor,
  type FormatExtractorDeps,
  requireOcr,
} from "./shared";

const DOCX_TYPE =
  /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/i;
const DOCX_EXTENSION = /\.docx$/i;

function isDocx(contentType: string, fileName: string): boolean {
  return DOCX_TYPE.test(contentType) || DOCX_EXTENSION.test(fileName);
}

export function createDocxExtractor(
  deps: FormatExtractorDeps
): FormatExtractor {
  const { ocr } = deps;
  return {
    matches: isDocx,
    supports: (contentType, fileName) =>
      ocr !== undefined && isDocx(contentType, fileName),
    async extract(input) {
      requireOcr(ocr, input);
      return await extractViaOcr(ocr, input, "document");
    },
  };
}
