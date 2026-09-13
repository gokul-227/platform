"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type {
  CreateGraphEdgeInput,
  GetGraphEdgeQuery,
  GraphEdgeListInput,
  GraphScope,
  UpdateGraphEdgeInput,
} from "../../index";

/**
 * Graph edges. Same shape as `graph.node.hooks`: reads unchanged; writes are
 * changeset sugar taking `scope` as data. For multi-op or mixed writes use
 * `useApplyGraph`.
 */
export function useGraphEdges(
  scope: GraphScope | null | undefined,
  query?: Omit<GraphEdgeListInput, "orgId" | "projectId">
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: scope
      ? ([...platformKeys.graph.edges.list(scope), query ?? null] as const)
      : (["platform", "graph", "edges", "disabled"] as const),
    queryFn: () => client.graph.edges.list(scope!, query),
    enabled: !!scope,
  });
}

export function useGraphEdge(
  edgeId: string | null | undefined,
  query?: GetGraphEdgeQuery
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: edgeId
      ? ([...platformKeys.graph.edges.detail(edgeId), query ?? null] as const)
      : (["platform", "graph", "edges", "disabled"] as const),
    queryFn: () => client.graph.edges.findById(edgeId!, query),
    enabled: !!edgeId,
  });
}

export function useCreateGraphEdge() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      input,
    }: {
      scope: GraphScope;
      input: CreateGraphEdgeInput;
    }) => client.graph.edges.create(scope, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: platformKeys.graph.edges.list(vars.scope),
      });
    },
  });
}

export function useUpsertGraphEdge() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      input,
    }: {
      scope: GraphScope;
      input: CreateGraphEdgeInput & { id?: string };
    }) => client.graph.edges.upsert(scope, input),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: platformKeys.graph.edges.lists() });
      void qc.invalidateQueries({
        queryKey: platformKeys.graph.edges.detail(data.id),
      });
    },
  });
}

export function useUpdateGraphEdge() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      edgeId,
      input,
    }: {
      scope: GraphScope;
      edgeId: string;
      input: UpdateGraphEdgeInput;
    }) => client.graph.edges.update(scope, edgeId, input),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: platformKeys.graph.edges.lists() });
      void qc.invalidateQueries({
        queryKey: platformKeys.graph.edges.detail(data.id),
      });
    },
  });
}

export function useDeleteGraphEdge() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scope, edgeId }: { scope: GraphScope; edgeId: string }) =>
      client.graph.edges.delete(scope, edgeId),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: platformKeys.graph.edges.lists() });
      void qc.invalidateQueries({
        queryKey: platformKeys.graph.edges.detail(vars.edgeId),
      });
    },
  });
}
