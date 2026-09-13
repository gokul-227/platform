import { describe, expect, it, vi } from "vitest";

import { createDefaultExtractor } from "../../../src/modules/index/providers/file.extractor";
import type { MistralOcr } from "../../../src/modules/index/providers/file.ocr.mistral";

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function fakeOcr(): MistralOcr & { process: ReturnType<typeof vi.fn> } {
  return { process: vi.fn(async () => ({ markdown: "# From OCR" })) };
}

/**
 * A minimal one-page PDF with no text layer, the shape a scanned page has.
 * pdf.js recovers the objects without a valid xref table. Fresh bytes per
 * call, because pdf.js detaches the buffer it is handed.
 */
function blankPdf(): Uint8Array {
  return new TextEncoder().encode(
    [
      "%PDF-1.4",
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj",
      "trailer<</Size 4/Root 1 0 R>>",
      "%%EOF",
    ].join("\n")
  );
}

describe("default extractor without OCR", () => {
  const extractor = createDefaultExtractor();

  it("supports text and pdf, not office or images", () => {
    expect(extractor.supports("text/markdown", "a.md")).toBe(true);
    expect(extractor.supports("application/pdf", "a.pdf")).toBe(true);
    expect(extractor.supports(DOCX_TYPE, "a.docx")).toBe(false);
    expect(extractor.supports("image/png", "site.png")).toBe(false);
  });

  it("decodes plain text as-is", async () => {
    const { markdown } = await extractor.extract({
      data: new TextEncoder().encode("# Heading\n\nBody."),
      contentType: "text/markdown",
      fileName: "a.md",
    });
    expect(markdown).toBe("# Heading\n\nBody.");
  });

  it("refuses office formats with an error naming OCR", async () => {
    await expect(
      extractor.extract({
        data: new Uint8Array(),
        contentType: DOCX_TYPE,
        fileName: "a.docx",
      })
    ).rejects.toMatchObject({
      code: "FILE_INDEX_UNSUPPORTED_CONTENT_TYPE",
      message: expect.stringContaining("OCR"),
    });
  });

  it("fails loudly on a PDF with an empty text layer instead of indexing nothing", async () => {
    await expect(
      extractor.extract({
        data: blankPdf(),
        contentType: "application/pdf",
        fileName: "scan.pdf",
      })
    ).rejects.toMatchObject({
      code: "FILE_INDEX_UNSUPPORTED_CONTENT_TYPE",
      message: expect.stringContaining("OCR"),
    });
  });
});

describe("default extractor with OCR", () => {
  it("supports office formats and images", () => {
    const extractor = createDefaultExtractor({ ocr: fakeOcr() });
    expect(extractor.supports(DOCX_TYPE, "a.docx")).toBe(true);
    expect(extractor.supports("image/png", "site.png")).toBe(true);
    expect(extractor.supports("application/zip", "a.zip")).toBe(false);
  });

  it("routes every PDF through OCR, digital ones included", async () => {
    const ocr = fakeOcr();
    const extractor = createDefaultExtractor({ ocr });
    const { markdown } = await extractor.extract({
      data: new Uint8Array(),
      contentType: "application/pdf",
      fileName: "digital.pdf",
      url: "https://signed.example/digital.pdf",
    });
    expect(markdown).toBe("# From OCR");
    expect(ocr.process).toHaveBeenCalledWith({
      url: "https://signed.example/digital.pdf",
      type: "document",
    });
  });

  it("counts a parseable PDF's pages so OCR can split past the provider cap", async () => {
    const ocr = fakeOcr();
    const extractor = createDefaultExtractor({ ocr });
    await extractor.extract({
      data: blankPdf(),
      contentType: "application/pdf",
      fileName: "scan.pdf",
      url: "https://signed.example/scan.pdf",
    });
    expect(ocr.process).toHaveBeenCalledWith({
      url: "https://signed.example/scan.pdf",
      type: "document",
      pageCount: 1,
    });
  });

  it("routes office documents as documents and images as images", async () => {
    const ocr = fakeOcr();
    const extractor = createDefaultExtractor({ ocr });
    await extractor.extract({
      data: new Uint8Array(),
      contentType: DOCX_TYPE,
      fileName: "a.docx",
      url: "https://signed.example/a.docx",
    });
    expect(ocr.process).toHaveBeenLastCalledWith({
      url: "https://signed.example/a.docx",
      type: "document",
    });

    await extractor.extract({
      data: new Uint8Array(),
      contentType: "image/png",
      fileName: "site.png",
      url: "https://signed.example/site.png",
    });
    expect(ocr.process).toHaveBeenLastCalledWith({
      url: "https://signed.example/site.png",
      type: "image",
    });
  });

  it("leaves plain text alone: no OCR call for what decoding covers", async () => {
    const ocr = fakeOcr();
    const extractor = createDefaultExtractor({ ocr });
    const { markdown } = await extractor.extract({
      data: new TextEncoder().encode("plain"),
      contentType: "text/plain",
      fileName: "a.txt",
      url: "https://signed.example/a.txt",
    });
    expect(markdown).toBe("plain");
    expect(ocr.process).not.toHaveBeenCalled();
  });

  it("fails when the extraction carried no signed url", async () => {
    const extractor = createDefaultExtractor({ ocr: fakeOcr() });
    await expect(
      extractor.extract({
        data: new Uint8Array(),
        contentType: "application/pdf",
        fileName: "a.pdf",
      })
    ).rejects.toMatchObject({ code: "FILE_INDEX_EXTRACTION_FAILED" });
  });
});
