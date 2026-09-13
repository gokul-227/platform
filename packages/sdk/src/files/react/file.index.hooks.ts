"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type {
  AskFilesInput,
  FileScope,
  RetrieveFilesInput,
  SearchFilesInput,
} from "../../index";

/**
 * Reading the document index.
 *
 * The four retrieval rungs are mutations rather than queries, which is the one
 * surprising choice here. A query hook fires on mount and refetches on focus;
 * searching is something a person does on purpose, each call costs an embedding
 * (and for `ask`, a generation), and the natural UI is a box you type into and
 * submit. `mutateAsync` gives you that without a stale-key dance. Reach for
 * `useFileSearchQuery` only when the query string genuinely is part of the URL
 * or component state and should re-run when it changes.
 *
 * `useFileIndexState` is a real query: it is a status somebody watches change.
 */

/** Search chunks. One embedding call and one vector query. */
export function useFileSearch(scope: FileScope | null | undefined) {
  const client = usePlatformClient();
  return useMutation({
    mutationKey: scope
      ? platformKeys.files.search(scope, "search")
      : ["platform", "files", "search", "disabled"],
    mutationFn: (input: SearchFilesInput) => {
      if (!scope) {
        throw new Error("useFileSearch: no scope");
      }
      return client.files.index.search(scope, input);
    },
  });
}

/** Search, widen, merge, budget. Passages rather than chunks. */
export function useFileRetrieve(scope: FileScope | null | undefined) {
  const client = usePlatformClient();
  return useMutation({
    mutationKey: scope
      ? platformKeys.files.search(scope, "retrieve")
      : ["platform", "files", "retrieve", "disabled"],
    mutationFn: (input: RetrieveFilesInput) => {
      if (!scope) {
        throw new Error("useFileRetrieve: no scope");
      }
      return client.files.index.retrieve(scope, input);
    },
  });
}

/** Retrieval formatted for a prompt, with citations kept separately. */
export function useFileContext(scope: FileScope | null | undefined) {
  const client = usePlatformClient();
  return useMutation({
    mutationKey: scope
      ? platformKeys.files.search(scope, "context")
      : ["platform", "files", "context", "disabled"],
    mutationFn: (input: RetrieveFilesInput) => {
      if (!scope) {
        throw new Error("useFileContext: no scope");
      }
      return client.files.index.context(scope, input);
    },
  });
}

/**
 * A grounded answer plus the context and sources behind it. Needs an answer
 * model on the deployment; without one this rejects with
 * `FILE_INDEX_ANSWERER_NOT_CONFIGURED` and the other three rungs still work.
 */
export function useFileAsk(scope: FileScope | null | undefined) {
  const client = usePlatformClient();
  return useMutation({
    mutationKey: scope
      ? platformKeys.files.search(scope, "ask")
      : ["platform", "files", "ask", "disabled"],
    mutationFn: (input: AskFilesInput) => {
      if (!scope) {
        throw new Error("useFileAsk: no scope");
      }
      return client.files.index.ask(scope, input);
    },
  });
}

/**
 * Search as component state: re-runs when `input` changes and caches per query.
 * Pass `input: null` to hold it (an empty search box).
 */
export function useFileSearchQuery(
  scope: FileScope | null | undefined,
  input: SearchFilesInput | null
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: scope
      ? ([...platformKeys.files.search(scope, "search"), input] as const)
      : (["platform", "files", "search", "disabled"] as const),
    queryFn: () =>
      client.files.index.search(scope as FileScope, input as SearchFilesInput),
    enabled: Boolean(scope && input),
  });
}

/**
 * Where a file stands in the index. Indexing runs after the upload confirms, so
 * a document is `pending` for a moment before it is searchable; polling while it
 * is in flight is what lets a UI say "indexing" instead of implying the file is
 * broken.
 *
 * A file that was never submitted has no index row, so this errors with
 * `FILE_INDEX_NOT_INDEXED`. That is the answer, not a fault: treat it as "not
 * indexed" rather than surfacing it.
 */
export function useFileIndexState(
  fileId: string | null | undefined,
  options?: { pollWhilePendingMs?: number }
) {
  const client = usePlatformClient();
  const interval = options?.pollWhilePendingMs ?? 3000;
  return useQuery({
    queryKey: fileId
      ? platformKeys.files.indexState(fileId)
      : (["platform", "files", "index", "disabled"] as const),
    queryFn: () => client.files.index.state(fileId as string),
    enabled: !!fileId,
    // Only while the worker still owes an answer; an indexed or failed document
    // is not going to change on its own.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "processing" ? interval : false;
    },
    retry: false,
  });
}
