"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type { UpdateUserInput } from "../../index";

export function useMe() {
  const client = usePlatformClient();
  return useQuery({
    queryKey: platformKeys.me(),
    queryFn: () => client.me.get(),
  });
}

/**
 * What the caller holds. A surface decides which controls exist from the permits
 * here rather than from a standing: a standing reaches down the parent chain, so
 * an organization's owner administers a project without holding anything written
 * on it.
 *
 * Without an organization it spans every one the caller reaches — the call a
 * shell makes on first paint, before it has resolved a scope.
 */
export function useMyStandings(orgId?: string | null) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: platformKeys.standings(orgId ?? ""),
    queryFn: () => client.me.standings(orgId ?? undefined),
  });
}

export function useUpdateMe() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => client.me.update(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.me() });
    },
  });
}

/** Merge-write one metadata key (dotted path) on the signed-in user. */
export function useSetMeMetadata() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ keyPath, value }: { keyPath: string; value: unknown }) =>
      client.me.metadata.set(keyPath, value),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.me() });
    },
  });
}

/** Remove one metadata key (dotted path) from the signed-in user. */
export function useDeleteMeMetadata() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyPath: string) => client.me.metadata.delete(keyPath),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.me() });
    },
  });
}
