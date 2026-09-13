/**
 * OCR reads what is legible in them: a site photo's signage, a
 * drawing export's labels. Matched by content type alone; extensions are too
 * unreliable a signal for binary image data.
 */

import {
  extractViaOcr,
  type FormatExtractor,
  type FormatExtractorDeps,
  requireOcr,
} from "./shared";

const IMAGE_TYPES = /^image\/(png|jpe?g|avif|webp)$/i;

function isImage(contentType: string): boolean {
  return IMAGE_TYPES.test(contentType);
}

export function createImageExtractor(
  deps: FormatExtractorDeps
): FormatExtractor {
  const { ocr } = deps;
  return {
    matches: (contentType) => isImage(contentType),
    supports: (contentType) => ocr !== undefined && isImage(contentType),
    async extract(input) {
      requireOcr(ocr, input);
      return await extractViaOcr(ocr, input, "image");
    },
  };
}
