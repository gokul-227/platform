"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type {
  CreateThreadInput,
  ThreadListInput,
  ThreadScope,
  UpdateThreadInput,
} from "../../index";

const DISABLED = ["platform", "threads", "disabled"] as const;

/** List the caller's own threads in one scope. */
export function useThreads(
  scope: ThreadScope | null | undefined,
  query?: Omit<ThreadListInput, "orgId" | "projectId">
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: scope
      ? ([...platformKeys.threads.list(scope), query ?? null] as const)
      : DISABLED,
    queryFn: () => client.threads.list(scope!, query),
    enabled: !!scope,
  });
}

export function useThread(threadId: string | null | undefined) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: threadId ? platformKeys.threads.detail(threadId) : DISABLED,
    queryFn: () => client.threads.findById(threadId!),
    enabled: !!threadId,
  });
}

export function useCreateThread() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      input,
    }: {
      scope: ThreadScope;
      input?: Omit<CreateThreadInput, "scope">;
    }) => client.threads.create(scope, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: platformKeys.threads.list(vars.scope),
      });
    },
  });
}

export function useUpdateThread() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      input,
    }: {
      threadId: string;
      input: UpdateThreadInput;
    }) => client.threads.update(threadId, input),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: platformKeys.threads.lists() });
      void qc.invalidateQueries({
        queryKey: platformKeys.threads.detail(data.id),
      });
    },
  });
}

export function useDeleteThread() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId }: { threadId: string }) =>
      client.threads.delete(threadId),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: platformKeys.threads.lists() });
      void qc.invalidateQueries({
        queryKey: platformKeys.threads.detail(vars.threadId),
      });
    },
  });
}
