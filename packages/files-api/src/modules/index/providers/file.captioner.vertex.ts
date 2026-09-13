/**
 * Figure captions from Gemini on Vertex, same identity as the embedder.
 *
 * One dense paragraph per figure, written for search indexing rather than for
 * display: the caption is what makes a drawing or site photo retrievable, so
 * it must name what is visible, not editorialize.
 */

import { PlatformError } from "@aec-craft/platform-contracts";
import { FileIndexErrors } from "../file.index.errors";
import type { Captioner } from "../file.index.seams";
import { createVertexAuth, type VertexAuthOptions } from "./vertex-auth";

export interface VertexCaptionerOptions extends VertexAuthOptions {
  fetch?: typeof globalThis.fetch;
  /** Default "global": generateContent models are served there regardless of regional rollout. */
  location?: string;
  /** Default "gemini-2.5-flash". */
  model?: string;
}

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_LOCATION = "global";

const PROMPT =
  "Describe this figure from a document in one dense paragraph for search indexing. " +
  "Name the type (photo, floor plan, chart, table, diagram), what it shows, and any " +
  "readable labels, numbers, or captions. No preamble.";

export function createVertexCaptioner(
  options: VertexCaptionerOptions = {}
): Captioner {
  const model = options.model ?? DEFAULT_MODEL;
  const location = options.location ?? DEFAULT_LOCATION;
  const doFetch = options.fetch ?? globalThis.fetch;
  const auth = createVertexAuth(options);
  const host =
    location === "global"
      ? "aiplatform.googleapis.com"
      : `${location}-aiplatform.googleapis.com`;

  return {
    async caption(figure) {
      const { token, project } = await auth();
      const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
      const response = await doFetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inline_data: {
                    mime_type: figure.contentType,
                    data: Buffer.from(figure.data).toString("base64"),
                  },
                },
                { text: PROMPT },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        }),
      });
      if (!response.ok) {
        throw new PlatformError(
          FileIndexErrors.EXTRACTION_FAILED,
          `Vertex caption answered ${response.status}: ${(
            await response.text()
          ).slice(0, 300)}`
        );
      }
      const body = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = (body.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      if (!text) {
        throw new PlatformError(
          FileIndexErrors.EXTRACTION_FAILED,
          "Vertex caption: empty response"
        );
      }
      return text;
    },
  };
}
