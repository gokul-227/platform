/**
 * Grounded answers from Gemini on Vertex, same identity as the embedder.
 *
 * The system prompt is the whole safety property here: the model answers from
 * the numbered passages or says it cannot. An answerer that falls back on its
 * own knowledge would produce confident text with citations that do not support
 * it, which is worse than no answer on a document platform.
 */

import { InternalErrors, PlatformError } from "@aec-craft/platform-contracts";
import type { Answerer } from "../file.index.seams";
import { createVertexAuth, type VertexAuthOptions } from "./vertex-auth";

export interface VertexAnswererOptions extends VertexAuthOptions {
  fetch?: typeof globalThis.fetch;
  /** Default "global". */
  location?: string;
  /** Default "gemini-2.5-flash". */
  model?: string;
}

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_LOCATION = "global";

const SYSTEM_PROMPT = [
  "Answer the question using ONLY the numbered context passages.",
  "Cite every claim with its passage number in square brackets, e.g. [1].",
  "If the context does not contain the answer, say so plainly. Do not guess.",
  "Answer in the language of the question.",
].join(" ");

export function createVertexAnswerer(
  options: VertexAnswererOptions = {}
): Answerer {
  const model = options.model ?? DEFAULT_MODEL;
  const location = options.location ?? DEFAULT_LOCATION;
  const doFetch = options.fetch ?? globalThis.fetch;
  const auth = createVertexAuth(options);
  const host =
    location === "global"
      ? "aiplatform.googleapis.com"
      : `${location}-aiplatform.googleapis.com`;

  return {
    async answer({ question, context, instructions }) {
      const { token, project } = await auth();
      const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
      const response = await doFetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: instructions
                  ? `${SYSTEM_PROMPT}\n\n${instructions}`
                  : SYSTEM_PROMPT,
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                { text: `Context:\n\n${context}\n\nQuestion: ${question}` },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
      });
      if (!response.ok) {
        throw new PlatformError(
          InternalErrors.UNEXPECTED,
          `Vertex answer answered ${response.status}: ${(
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
          InternalErrors.UNEXPECTED,
          "Vertex answer came back empty"
        );
      }
      return text;
    },
  };
}
