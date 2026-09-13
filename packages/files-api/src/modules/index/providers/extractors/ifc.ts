/**
 * Registered so the wiring pattern is visible, and inert until the handling
 * decision is made. Claiming nothing means an IFC upload behaves exactly as it
 * did before this file existed.
 */

import { PlatformError } from "@aec-craft/platform-contracts";
import { FileIndexErrors } from "../../file.index.errors";
import type { FormatExtractor } from "./shared";

// TODO: decide IFC handling: model text extracted here, or an `ifc` step.
export function createIfcExtractor(): FormatExtractor {
  return {
    matches: () => false,
    supports: () => false,
    extract(input) {
      return Promise.reject(
        new PlatformError(
          FileIndexErrors.UNSUPPORTED_CONTENT_TYPE,
          `IFC extraction is not implemented (${input.fileName})`
        )
      );
    },
  };
}
