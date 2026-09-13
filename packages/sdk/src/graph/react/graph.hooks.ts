"use client";

import {
  GRAPH_VOCABULARY,
  type GraphEdgeOp,
  type GraphNodeOp,
  type GraphScope,
  type GraphVocabulary,
} from "@aec-craft/platform-contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";

/**
 * Static accessor for the vocabulary manifest (canonical lists +
 * descriptions for node types, edge types, class roots and data block keys).
 * Provided as a hook for convention; the value is a frozen `const` so there
 * is no fetch, no cache invalidation, and no loading state.
 */
export function useGraphVocabulary(): GraphVocabulary {
  return GRAPH_VOCABULARY;
}

/**
 * The graph changeset (`POST /graph`): one transaction over both kinds. Use for
 * multi-op or mixed node+edge writes (the single-op `useCreate/Update/Delete`
 * hooks are sugar over the same route). On success it invalidates every graph
 * query, since a changeset can touch arbitrary nodes and edges.
 */
export function useApplyGraph() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      input,
    }: {
      scope: GraphScope;
      input: { nodes?: GraphNodeOp[]; edges?: GraphEdgeOp[] };
    }) => client.graph.apply(scope, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.graph.all() });
    },
  });
}

// No hooks for the `graph.query` subdomain (`client.graph.query.run` /
// `.health`) by design: both are EXPERIMENTAL (degrade to 503 without a graph
// DB), and neither is a conventional cacheable read — `run` is a free-form
// Cypher POST and `health` is a never-erroring probe. Call them directly on the
// SDK; add hooks here once the typed traversal routes land and the shapes settle.
