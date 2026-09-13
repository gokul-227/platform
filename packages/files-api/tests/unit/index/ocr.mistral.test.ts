import { describe, expect, it, vi } from "vitest";

import {
  createMistralOcr,
  createVertexMistralOcr,
} from "../../../src/modules/index/providers/file.ocr.mistral";

interface Call {
  authorization: string | undefined;
  body: Record<string, unknown>;
  url: string;
}

/** A fetch stand-in that records calls and replays queued responses in order,
 * repeating the last one once the queue runs out. */
function fakeFetchSequence(responses: { body?: unknown; status?: number }[]) {
  const calls: Call[] = [];
  const doFetch = vi.fn(async (url: string, init?: RequestInit) => {
    const response =
      responses[Math.min(calls.length, responses.length - 1)] ?? {};
    calls.push({
      url: String(url),
      authorization: (init?.headers as Record<string, string> | undefined)
        ?.authorization,
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    const status = response.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response.body ?? {},
      text: async () => JSON.stringify(response.body ?? {}),
    } as unknown as Response;
  });
  return { calls, doFetch: doFetch as unknown as typeof globalThis.fetch };
}

/** A fetch stand-in that records calls and replays one queued response. */
function fakeFetch(response: { body?: unknown; status?: number } = {}) {
  return fakeFetchSequence([response]);
}

describe("mistral ocr client", () => {
  it("sends the signed url as a document and assembles page markers", async () => {
    const { calls, doFetch } = fakeFetch({
      body: {
        pages: [
          { index: 0, markdown: "# Title\n\nIntro" },
          { index: 1, markdown: "Second page." },
        ],
      },
    });
    const ocr = createMistralOcr({ apiKey: "mk", fetch: doFetch });
    const out = await ocr.process({
      url: "https://signed.example/f.pdf",
      type: "document",
    });

    expect(calls[0]?.url).toBe("https://api.mistral.ai/v1/ocr");
    expect(calls[0]?.body.model).toBe("mistral-ocr-latest");
    expect(calls[0]?.body.document).toEqual({
      type: "document_url",
      document_url: "https://signed.example/f.pdf",
    });
    expect(out.markdown).toBe(
      "<!-- page:1 -->\n# Title\n\nIntro\n\n<!-- page:2 -->\nSecond page."
    );
  });

  it("sends an image as image_url", async () => {
    const { calls, doFetch } = fakeFetch({
      body: { pages: [{ markdown: "A site photo." }] },
    });
    const ocr = createMistralOcr({ apiKey: "mk", fetch: doFetch });
    await ocr.process({ url: "https://signed.example/a.png", type: "image" });

    expect(calls[0]?.body.document).toEqual({
      type: "image_url",
      image_url: "https://signed.example/a.png",
    });
  });

  it("strips figure placeholders and keeps external image links", async () => {
    const { doFetch } = fakeFetch({
      body: {
        pages: [
          {
            markdown:
              "Intro ![img-0.jpeg](img-0.jpeg) and ![logo](https://example.com/logo.png).",
          },
        ],
      },
    });
    const ocr = createMistralOcr({ apiKey: "mk", fetch: doFetch });
    const out = await ocr.process({
      url: "https://signed.example/f.pdf",
      type: "document",
    });

    expect(out.markdown).not.toContain("img-0.jpeg");
    expect(out.markdown).toContain("https://example.com/logo.png");
  });

  it("with figures on, decodes images and links stable refs", async () => {
    const { calls, doFetch } = fakeFetch({
      body: {
        pages: [
          {
            index: 0,
            markdown: "# Title\n\nIntro ![img-0.jpeg](img-0.jpeg)",
            images: [
              {
                id: "img-0.jpeg",
                image_base64: Buffer.from("fakejpg").toString("base64"),
              },
            ],
          },
        ],
      },
    });
    const ocr = createMistralOcr({
      apiKey: "mk",
      figures: true,
      fetch: doFetch,
    });
    const out = await ocr.process({
      url: "https://signed.example/f.pdf",
      type: "document",
    });

    expect(calls[0]?.body.include_image_base64).toBe(true);
    expect(out.markdown).toContain("![img-0.jpeg](figure://img-0.jpeg)");
    expect(out.figures).toHaveLength(1);
    expect(out.figures?.[0]).toMatchObject({
      id: "img-0.jpeg",
      contentType: "image/jpeg",
      page: 1,
    });
    expect(new TextDecoder().decode(out.figures?.[0]?.data)).toBe("fakejpg");
  });

  it("honours model and baseUrl overrides", async () => {
    const { calls, doFetch } = fakeFetch({ body: { pages: [] } });
    const ocr = createMistralOcr({
      apiKey: "mk",
      model: "mistral-ocr-2505",
      baseUrl: "https://mistral.internal/",
      fetch: doFetch,
    });
    await ocr.process({
      url: "https://signed.example/f.pdf",
      type: "document",
    });

    expect(calls[0]?.url).toBe("https://mistral.internal/v1/ocr");
    expect(calls[0]?.body.model).toBe("mistral-ocr-2505");
  });

  it("OCRs a document past the cap in page ranges and rebases the markers", async () => {
    const { calls, doFetch } = fakeFetchSequence([
      {
        body: {
          pages: [
            { index: 0, markdown: "First" },
            { index: 1, markdown: "Second" },
          ],
        },
      },
      {
        body: {
          pages: [
            { index: 0, markdown: "Third" },
            { index: 1, markdown: "Fourth" },
          ],
        },
      },
      { body: { pages: [{ index: 0, markdown: "Fifth" }] } },
    ]);
    const ocr = createMistralOcr({
      apiKey: "mk",
      maxPagesPerRequest: 2,
      fetch: doFetch,
    });
    const out = await ocr.process({
      url: "https://signed.example/norm.pdf",
      type: "document",
      pageCount: 5,
    });

    expect(calls.map((call) => call.body.pages)).toEqual([[0, 1], [2, 3], [4]]);
    for (const call of calls) {
      expect(call.body.document).toEqual({
        type: "document_url",
        document_url: "https://signed.example/norm.pdf",
      });
    }
    expect(out.markdown).toBe(
      [
        "<!-- page:1 -->\nFirst",
        "<!-- page:2 -->\nSecond",
        "<!-- page:3 -->\nThird",
        "<!-- page:4 -->\nFourth",
        "<!-- page:5 -->\nFifth",
      ].join("\n\n")
    );
  });

  it("keeps markers absolute when a ranged response numbers documentwide", async () => {
    const { doFetch } = fakeFetchSequence([
      { body: { pages: [{ index: 0, markdown: "First" }] } },
      { body: { pages: [{ index: 1, markdown: "Second" }] } },
    ]);
    const ocr = createMistralOcr({
      apiKey: "mk",
      maxPagesPerRequest: 1,
      fetch: doFetch,
    });
    const out = await ocr.process({
      url: "https://signed.example/norm.pdf",
      type: "document",
      pageCount: 2,
    });

    expect(out.markdown).toBe(
      "<!-- page:1 -->\nFirst\n\n<!-- page:2 -->\nSecond"
    );
  });

  it("sends a counted document whole when it stays under the cap", async () => {
    const { calls, doFetch } = fakeFetch({
      body: { pages: [{ index: 0, markdown: "All of it" }] },
    });
    const ocr = createMistralOcr({ apiKey: "mk", fetch: doFetch });
    await ocr.process({
      url: "https://signed.example/f.pdf",
      type: "document",
      pageCount: 5,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).not.toHaveProperty("pages");
  });

  it("fails the whole document when a range fails, sending nothing further", async () => {
    const { calls, doFetch } = fakeFetchSequence([
      { body: { pages: [{ index: 0, markdown: "First" }] } },
      { status: 400, body: { error: "no such pages" } },
    ]);
    const ocr = createMistralOcr({
      apiKey: "mk",
      maxPagesPerRequest: 1,
      fetch: doFetch,
    });

    await expect(
      ocr.process({
        url: "https://signed.example/norm.pdf",
        type: "document",
        pageCount: 3,
      })
    ).rejects.toMatchObject({
      code: "FILE_INDEX_EXTRACTION_FAILED",
      message: expect.stringContaining("400"),
    });
    expect(calls).toHaveLength(2);
  });

  it("keeps colliding figure ids from different ranges apart", async () => {
    const { doFetch } = fakeFetchSequence([
      {
        body: {
          pages: [
            {
              index: 0,
              markdown: "Plan ![img-0.jpeg](img-0.jpeg)",
              images: [
                {
                  id: "img-0.jpeg",
                  image_base64: Buffer.from("first").toString("base64"),
                },
              ],
            },
          ],
        },
      },
      {
        body: {
          pages: [
            {
              index: 0,
              markdown: "Detail ![img-0.jpeg](img-0.jpeg)",
              images: [
                {
                  id: "img-0.jpeg",
                  image_base64: Buffer.from("second").toString("base64"),
                },
              ],
            },
          ],
        },
      },
    ]);
    const ocr = createMistralOcr({
      apiKey: "mk",
      figures: true,
      maxPagesPerRequest: 1,
      fetch: doFetch,
    });
    const out = await ocr.process({
      url: "https://signed.example/norm.pdf",
      type: "document",
      pageCount: 2,
    });

    expect(out.figures?.map((figure) => figure.id)).toEqual([
      "r0-img-0.jpeg",
      "r1-img-0.jpeg",
    ]);
    expect(out.figures?.map((figure) => figure.page)).toEqual([1, 2]);
    expect(out.markdown).toContain("(figure://r0-img-0.jpeg)");
    expect(out.markdown).toContain("(figure://r1-img-0.jpeg)");
    expect(
      out.figures?.map((figure) => new TextDecoder().decode(figure.data))
    ).toEqual(["first", "second"]);
  });

  it("fails as EXTRACTION_FAILED when the provider answers non-2xx", async () => {
    const { doFetch } = fakeFetch({
      status: 429,
      body: { error: "slow down" },
    });
    const ocr = createMistralOcr({ apiKey: "mk", fetch: doFetch });

    await expect(
      ocr.process({ url: "https://signed.example/f.pdf", type: "document" })
    ).rejects.toMatchObject({
      code: "FILE_INDEX_EXTRACTION_FAILED",
      message: expect.stringContaining("429"),
    });
  });
});

describe("mistral ocr on vertex", () => {
  it("addresses the model garden publisher and authorizes with an adc token", async () => {
    const { calls, doFetch } = fakeFetch({
      body: { pages: [{ index: 0, markdown: "Scanned." }] },
    });
    const ocr = createVertexMistralOcr({
      fetch: doFetch,
      getAccessToken: () => Promise.resolve("adc-token"),
      projectId: "platform-dev",
    });
    const out = await ocr.process({
      url: "https://signed.example/f.pdf",
      type: "document",
    });

    expect(calls[0]?.url).toBe(
      "https://europe-west4-aiplatform.googleapis.com/v1/projects/platform-dev/locations/europe-west4/publishers/mistralai/models/mistral-ocr-2505:rawPredict"
    );
    expect(calls[0]?.authorization).toBe("Bearer adc-token");
    // The pinned version, because Model Garden has no `-latest` alias.
    expect(calls[0]?.body.model).toBe("mistral-ocr-2505");
    expect(calls[0]?.body.document).toEqual({
      type: "document_url",
      document_url: "https://signed.example/f.pdf",
    });
    expect(out.markdown).toBe("<!-- page:1 -->\nScanned.");
  });

  it("processes in the region it was given", async () => {
    const { calls, doFetch } = fakeFetch({ body: { pages: [] } });
    const ocr = createVertexMistralOcr({
      fetch: doFetch,
      getAccessToken: () => Promise.resolve("adc-token"),
      location: "us-central1",
      projectId: "platform-dev",
    });
    await ocr.process({
      url: "https://signed.example/f.pdf",
      type: "document",
    });

    expect(calls[0]?.url).toContain(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/platform-dev/locations/us-central1/"
    );
  });

  it("carries a failure as a loud extraction error", async () => {
    const { doFetch } = fakeFetch({ status: 429, body: { error: "quota" } });
    const ocr = createVertexMistralOcr({
      fetch: doFetch,
      getAccessToken: () => Promise.resolve("adc-token"),
      projectId: "platform-dev",
    });

    await expect(
      ocr.process({ url: "https://signed.example/f.pdf", type: "document" })
    ).rejects.toMatchObject({ code: "FILE_INDEX_EXTRACTION_FAILED" });
  });
});
