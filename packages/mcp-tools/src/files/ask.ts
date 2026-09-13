/**
 * `org_files_ask` — proxy to `POST /orgs/{orgId}/files/ask` on apps/api.
 */

import {
  askFilesInputSchema,
  askFilesResponseSchema,
  scopeQueryShape,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../common/descriptor";

const inputSchema = z.object(scopeQueryShape).merge(askFilesInputSchema);

export const filesAskTool = defineTool({
  name: "files_ask",
  description:
    "Ask the indexed documents in one scope a question and get a written answer with " +
    "`[n]` citations, alongside the context and sources it was built from. The answer " +
    "is produced by a second model held to the retrieved passages, so it will say it " +
    "cannot find something rather than guess. If you are going to reason over the " +
    "material yourself, `org_files_context` is better and cheaper: it returns the " +
    "same passages without spending a generation on prose you would rewrite. " +
    "Answers 503 if the deployment configured no answer model. " +
    "Requires `read` on whichever scope is named.",
  inputSchema,
  outputSchema: askFilesResponseSchema,
  resource: "api",
  endpoint: { method: "POST", path: "/files/ask" },
  scopes: ["openid"],
});
