"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type {
  CreateThreadMessageInput,
  ThreadMessageListInput,
} from "../../index";

const DISABLED = ["platform", "threads", "disabled"] as const;

export function useThreadMessages(
  threadId: string | null | undefined,
  query?: ThreadMessageListInput
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: threadId
      ? ([
          ...platformKeys.threads.messages.list(threadId),
          query ?? null,
        ] as const)
      : DISABLED,
    queryFn: () => client.threads.messages.list(threadId!, query),
    enabled: !!threadId,
  });
}

/** Append a message (e.g. the user's question). Bumps thread recency. */
export function useCreateThreadMessage() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      input,
    }: {
      threadId: string;
      input: CreateThreadMessageInput;
    }) => client.threads.messages.create(threadId, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: platformKeys.threads.messages.all(vars.threadId),
      });
      void qc.invalidateQueries({
        queryKey: platformKeys.threads.detail(vars.threadId),
      });
      void qc.invalidateQueries({ queryKey: platformKeys.threads.lists() });
    },
  });
}
