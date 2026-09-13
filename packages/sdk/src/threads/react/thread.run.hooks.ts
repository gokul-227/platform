"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type { SubmitThreadRunInput, ThreadRunListInput } from "../../index";

const DISABLED = ["platform", "threads", "disabled"] as const;
const TERMINAL: readonly string[] = ["complete", "failed", "cancelled"];

export function useThreadRuns(
  threadId: string | null | undefined,
  query?: ThreadRunListInput
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: threadId
      ? ([...platformKeys.threads.runs.list(threadId), query ?? null] as const)
      : DISABLED,
    queryFn: () => client.threads.runs.list(threadId!, query),
    enabled: !!threadId,
  });
}

/**
 * Watch a single run until it reaches a terminal state. Polls every 1.5s while
 * the run is in-flight, then stops (the SSE stream is the live enhancement,
 * follow-up). This is how a client learns the answer landed after navigating away.
 */
export function useThreadRun(
  threadId: string | null | undefined,
  runId: string | null | undefined,
  options?: { enabled?: boolean }
) {
  const client = usePlatformClient();
  const enabled = !!threadId && !!runId && (options?.enabled ?? true);
  return useQuery({
    queryKey:
      threadId && runId
        ? platformKeys.threads.runs.detail(threadId, runId)
        : DISABLED,
    queryFn: () => client.threads.runs.findById(threadId!, runId!),
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && TERMINAL.includes(status)) {
        return false;
      }
      return 1500;
    },
  });
}

/** Start a run. The producer (server action) then generates and finalizes it. */
export function useCreateThreadRun() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId }: { threadId: string }) =>
      client.threads.runs.create(threadId),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: platformKeys.threads.runs.all(vars.threadId),
      });
    },
  });
}

export function useCancelThreadRun() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, runId }: { threadId: string; runId: string }) =>
      client.threads.runs.cancel(threadId, runId),
    onSuccess: (data, vars) => {
      void qc.invalidateQueries({
        queryKey: platformKeys.threads.runs.detail(vars.threadId, data.id),
      });
    },
  });
}

/** Answer a `requires_action` run's pending question; generation resumes. */
export function useSubmitThreadRun() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      runId,
      input,
    }: {
      threadId: string;
      runId: string;
      input: SubmitThreadRunInput;
    }) => client.threads.runs.submit(threadId, runId, input),
    onSuccess: (data, vars) => {
      void qc.invalidateQueries({
        queryKey: platformKeys.threads.runs.detail(vars.threadId, data.id),
      });
    },
  });
}
