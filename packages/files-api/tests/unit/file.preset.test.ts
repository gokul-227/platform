import { PlatformError } from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";

import type { UploadPresetConfig } from "../../src/config/config";
import {
  assertPresetAccepts,
  matchesContentType,
  presetByName,
  selectPreset,
} from "../../src/modules/file.preset";

const PRESETS: UploadPresetConfig[] = [
  {
    name: "default",
    maxFileSizeBytes: 100,
    acceptedContentTypes: null,
    pipeline: [],
  },
  {
    name: "document",
    maxFileSizeBytes: 50,
    acceptedContentTypes: ["application/pdf", "text/*"],
    pipeline: ["index"],
  },
] as UploadPresetConfig[];

/**
 * Admission is the one part of the upload path that needs no database, no
 * bucket and no session, which is why it is functions over the configured list
 * rather than methods on the service.
 */
describe("matching a content type against a preset's allowlist", () => {
  it("takes an exact type, a subtype wildcard, and `*/*`", () => {
    expect(matchesContentType("application/pdf", "application/pdf")).toBe(true);
    expect(matchesContentType("text/csv", "text/*")).toBe(true);
    expect(matchesContentType("image/png", "*/*")).toBe(true);
  });

  it("refuses a near miss rather than guessing", () => {
    expect(matchesContentType("application/pdfx", "application/pdf")).toBe(
      false
    );
    expect(matchesContentType("text/csv", "application/*")).toBe(false);
  });
});

describe("which preset an upload lands under", () => {
  it("routes by content type, so an uploader need not know the pipeline", () => {
    expect(selectPreset(PRESETS, "application/pdf")).toBe("document");
    expect(selectPreset(PRESETS, "text/csv")).toBe("document");
  });

  it("falls back to `default`, which is never a candidate for a match", () => {
    expect(selectPreset(PRESETS, "image/png")).toBe("default");
  });
});

describe("naming a preset", () => {
  it("resolves it, and an omitted name is `default`", () => {
    expect(presetByName(PRESETS, "document").name).toBe("document");
    expect(presetByName(PRESETS, undefined).name).toBe("default");
  });

  it("fails closed on an unknown name: the caller asked for a stricter limit", () => {
    expect(() => presetByName(PRESETS, "nope")).toThrowError(PlatformError);
  });
});

describe("admission", () => {
  it("accepts what the named preset allows", () => {
    expect(() =>
      assertPresetAccepts(PRESETS, "application/pdf", 10, "document")
    ).not.toThrow();
  });

  it("refuses a file over the preset's own limit, not the deployment's", () => {
    expect(() =>
      assertPresetAccepts(PRESETS, "application/pdf", 80, "document")
    ).toThrowError(expect.objectContaining({ code: "FILE_TOO_LARGE" }));
    expect(() =>
      assertPresetAccepts(PRESETS, "image/png", 80, "default")
    ).not.toThrow();
  });

  it("refuses a type the preset does not list", () => {
    expect(() =>
      assertPresetAccepts(PRESETS, "image/png", 10, "document")
    ).toThrowError(
      expect.objectContaining({ code: "FILE_CONTENT_TYPE_NOT_ALLOWED" })
    );
  });
});
