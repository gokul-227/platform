/**
 * `org_files_search` — proxy to `POST /orgs/{orgId}/files/search` on apps/api.
 */

import {
  scopeQueryShape,
  searchFilesInputSchema,
  searchFilesResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../common/descriptor";

const inputSchema = z.object(scopeQueryShape).merge(searchFilesInputSchema);

export const filesSearchTool = defineTool({
  name: "files_search",
  description:
    "Search the indexed documents in one scope by meaning and get back the matching " +
    "passages of text, each with its file, heading, page and score. The query is a " +
    "natural-language sentence, not keywords: it is compared by meaning, so it can " +
    "match a passage that shares no words with it. Covers the org's shared library only. " +
    "Use `filter` for exact matching on attributes a document was indexed with. " +
    "Only documents that were indexed are searchable, which is decided by the " +
    "preset they were uploaded under. Requires `read` on whichever scope is named.",
  inputSchema,
  outputSchema: searchFilesResponseSchema,
  resource: "api",
  endpoint: { method: "POST", path: "/files/search" },
  scopes: ["openid"],
});
