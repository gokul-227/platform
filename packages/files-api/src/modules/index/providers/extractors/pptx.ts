/**
 * PPTX: routed through OCR for now. Like DOCX it is structured XML and
 * deserves a native extractor.
 * TODO(#153): the native extractor.
 */

import {
  extractViaOcr,
  type FormatExtractor,
  type FormatExtractorDeps,
  requireOcr,
} from "./shared";

const PPTX_TYPE =
  /^application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation$/i;
const PPTX_EXTENSION = /\.pptx$/i;

function isPptx(contentType: string, fileName: string): boolean {
  return PPTX_TYPE.test(contentType) || PPTX_EXTENSION.test(fileName);
}

export function createPptxExtractor(
  deps: FormatExtractorDeps
): FormatExtractor {
  const { ocr } = deps;
  return {
    matches: isPptx,
    supports: (contentType, fileName) =>
      ocr !== undefined && isPptx(contentType, fileName),
    async extract(input) {
      requireOcr(ocr, input);
      return await extractViaOcr(ocr, input, "document");
    },
  };
}
