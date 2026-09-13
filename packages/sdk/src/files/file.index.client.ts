import type {
  AskFilesInput,
  AskFilesResponse,
  ContextFilesResponse,
  FileIndexResponse,
  FileScope,
  RetrieveFilesInput,
  RetrieveFilesResponse,
  SearchFilesInput,
  SearchFilesResponse,
} from "@aec-craft/platform-contracts";

import type { Http } from "../common/http";
import { qs } from "../common/qs";
import { scopeQuery } from "../common/scope";

/**
 * The document index: searching what a scope's documents say.
 *
 * A document becomes searchable because of the preset it was uploaded under, not
 * because anybody asked, so there is nothing to submit here. What is exposed is
 * the retrieval ladder, and each rung is the one below it plus a step:
 *
 *   search    ranked chunks. One embedding call, one vector query.
 *   retrieve  those chunks widened with the text around them, overlapping runs
 *             merged into passages, cut to a token budget. No extra model call.
 *   context   the same passages as one string with `[n]` markers, plus the
 *             sources those markers resolve to. Pure formatting.
 *   ask       that context answered by a model held to it, with citations.
 *             One generation call on top.
 *
 * Take the lowest rung that answers your question. If you are already calling a
 * model, `context` beats `ask`: you hold more of the conversation than the
 * answerer does, and `ask` spends a generation on prose you would rewrite.
 *
 *   client.files.index.search({ type: "project", projectId }, { query: "escape route width" })
 *   client.files.index.ask({ type: "org", orgId }, { question: "What is the party wall requirement?" })
 *
 * Every rung answers 503 `FILE_INDEX_NOT_CONFIGURED` on a deployment with no
 * index, and `ask` alone answers 503 `FILE_INDEX_ANSWERER_NOT_CONFIGURED` when
 * retrieval works but no answer model is configured.
 */
export class FileIndexClient {
  constructor(private readonly http: Http) {}

  /**
   * Rank chunks by meaning. The query is a sentence, not keywords: it is embedded
   * and compared, so it can match a passage sharing no words with it. `filter` is
   * the exact half, matched against the attributes the document was indexed with.
   *
   * `input.scope` narrows a project search the way a project listing narrows:
   * `project` for its own documents, `org` for the inherited library alone. The
   * default covers both. An org search ignores it, having only one layer.
   */
  search = (
    scope: FileScope,
    input: SearchFilesInput
  ): Promise<SearchFilesResponse> =>
    this.http.post<SearchFilesResponse>(
      `/files/search${qs(scopeQuery(scope))}`,
      input
    );

  /**
   * Search, then assemble. `expand: "neighbors"` adds the adjacent chunks,
   * `"section"` the hit's whole heading section; overlapping ranges within one
   * file merge, so a document matched three times in one section yields one
   * passage. `maxTokens` bounds the result.
   *
   * Note `topK` means something different here than on `search`: chunks fetched
   * before assembly, not passages returned.
   */
  retrieve = (
    scope: FileScope,
    input: RetrieveFilesInput
  ): Promise<RetrieveFilesResponse> =>
    this.http.post<RetrieveFilesResponse>(
      `/files/retrieve${qs(scopeQuery(scope))}`,
      input
    );

  /** `retrieve`, formatted for a prompt, with the citations kept separately. */
  context = (
    scope: FileScope,
    input: RetrieveFilesInput
  ): Promise<ContextFilesResponse> =>
    this.http.post<ContextFilesResponse>(
      `/files/context${qs(scopeQuery(scope))}`,
      input
    );

  /**
   * `context`, answered. The model is held to the retrieved passages and cites
   * each claim; when retrieval finds nothing it says so rather than answering
   * from its own knowledge.
   */
  ask = (scope: FileScope, input: AskFilesInput): Promise<AskFilesResponse> =>
    this.http.post<AskFilesResponse>(
      `/files/ask${qs(scopeQuery(scope))}`,
      input
    );

  /**
   * Where one file stands in the index. Indexing runs after the upload confirms,
   * so a document is `pending` for a moment before it is searchable; this is what
   * lets a UI say so rather than imply the file is broken.
   *
   * Answers `FILE_INDEX_NOT_INDEXED` for a file that was never submitted, which
   * is the answer rather than a fault.
   */
  state = (fileId: string): Promise<FileIndexResponse> =>
    this.http.get<FileIndexResponse>(
      `/files/${encodeURIComponent(fileId)}/index`
    );

  /**
   * Re-submit a file to the index. Not part of the upload path: indexing follows
   * from the preset a file arrived under, so this exists for recovering an
   * ingestion that failed rather than for deciding whether to index.
   */
  submit = (fileId: string): Promise<FileIndexResponse> =>
    this.http.post<FileIndexResponse>(
      `/files/${encodeURIComponent(fileId)}/index`,
      undefined
    );

  /** Drop a file from the index. The file itself is untouched. */
  drop = (fileId: string): Promise<void> =>
    this.http.delete<void>(`/files/${encodeURIComponent(fileId)}/index`);

  /**
   * The extracted text, as the index holds it. For showing what a search matched
   * against, which is the difference between a citation a person can check and
   * one they have to trust.
   */
  text = (fileId: string): Promise<string> =>
    this.http.get<string>(`/files/${encodeURIComponent(fileId)}/index/text`);
}
