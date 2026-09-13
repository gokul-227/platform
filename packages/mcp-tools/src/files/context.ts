/**
 * `org_files_context` — proxy to `POST /orgs/{orgId}/files/context` on apps/api.
 */

import {
  contextFilesResponseSchema,
  retrieveFilesInputSchema,
  scopeQueryShape,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../common/descriptor";

const inputSchema = z.object(scopeQueryShape).merge(retrieveFilesInputSchema);

export const filesContextTool = defineTool({
  name: "files_context",
  description:
    "Retrieve from the indexed documents in one scope and get one block of text with " +
    "numbered `[n]` markers, plus a `sources` list mapping each marker to its file, " +
    "heading and page. Prefer this over `org_files_search` when you intend to " +
    "answer from the documents: passages are widened with the text around them " +
    "(`expand`), overlapping runs are merged, and the whole thing is cut to " +
    "`maxTokens`, so it is ready to reason over and every claim stays attributable. " +
    "Covers the org's shared library only. Requires `read` on whichever scope is named.",
  inputSchema,
  outputSchema: contextFilesResponseSchema,
  resource: "api",
  endpoint: { method: "POST", path: "/files/context" },
  scopes: ["openid"],
});
