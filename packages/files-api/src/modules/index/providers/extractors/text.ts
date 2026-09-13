/** Plain text formats: decoded as-is, free, no page markers to emit. */

import type { FormatExtractor } from "./shared";

const TEXT_TYPES = /^text\/|^application\/(json|xml|x-yaml|yaml|geo\+json)/i;
const TEXT_EXTENSIONS = /\.(md|markdown|txt|csv|json|ya?ml|xml)$/i;

function isPlainText(contentType: string, fileName: string): boolean {
  return TEXT_TYPES.test(contentType) || TEXT_EXTENSIONS.test(fileName);
}

export function createTextExtractor(): FormatExtractor {
  return {
    matches: isPlainText,
    supports: isPlainText,
    extract(input) {
      return Promise.resolve({
        markdown: new TextDecoder().decode(input.data),
      });
    },
  };
}
