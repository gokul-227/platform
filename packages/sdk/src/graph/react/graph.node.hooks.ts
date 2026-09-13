"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type {
  CreateGraphNodeInput,
  GetGraphNodeQuery,
  GraphNodeListInput,
  GraphScope,
  UpdateGraphNodeInput,
} from "../../index";

/**
 * Graph nodes. Reads (`useGraphNodes` list, `useGraphNode` by-id) are
 * unchanged. Writes are sugar over the changeset (`POST /graph`): each mutation
 * takes `scope` as data (a changeset is scoped) and invalidates the right keys
 * after-the-fact. For multi-op or mixed node+edge writes use `useApplyGraph`.
 */
export function useGraphNodes(
  scope: GraphScope | null | undefined,
  query?: Omit<GraphNodeListInput, "orgId" | "projectId">
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: scope
      ? ([...platformKeys.graph.nodes.list(scope), query ?? null] as const)
      : (["platform", "graph", "nodes", "disabled"] as const),
    queryFn: () => client.graph.nodes.list(scope!, query),
    enabled: !!scope,
  });
}

export function useGraphNode(
  nodeId: string | null | undefined,
  query?: GetGraphNodeQuery
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: nodeId
      ? ([...platformKeys.graph.nodes.detail(nodeId), query ?? null] as const)
      : (["platform", "graph", "nodes", "disabled"] as const),
    queryFn: () => client.graph.nodes.findById(nodeId!, query),
    enabled: !!nodeId,
  });
}

export function useCreateGraphNode() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      input,
    }: {
      scope: GraphScope;
      input: CreateGraphNodeInput;
    }) => client.graph.nodes.create(scope, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: platformKeys.graph.nodes.list(vars.scope),
      });
    },
  });
}

export function useUpsertGraphNode() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      input,
    }: {
      scope: GraphScope;
      input: CreateGraphNodeInput & { id?: string };
    }) => client.graph.nodes.upsert(scope, input),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: platformKeys.graph.nodes.lists() });
      void qc.invalidateQueries({
        queryKey: platformKeys.graph.nodes.detail(data.id),
      });
    },
  });
}

export function useUpdateGraphNode() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      nodeId,
      input,
    }: {
      scope: GraphScope;
      nodeId: string;
      input: UpdateGraphNodeInput;
    }) => client.graph.nodes.update(scope, nodeId, input),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: platformKeys.graph.nodes.lists() });
      void qc.invalidateQueries({
        queryKey: platformKeys.graph.nodes.detail(data.id),
      });
    },
  });
}

export function useDeleteGraphNode() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scope, nodeId }: { scope: GraphScope; nodeId: string }) =>
      client.graph.nodes.delete(scope, nodeId),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: platformKeys.graph.nodes.lists() });
      void qc.invalidateQueries({
        queryKey: platformKeys.graph.nodes.detail(vars.nodeId),
      });
    },
  });
}
