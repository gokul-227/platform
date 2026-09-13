"use client";

import type { UserListInput } from "@aec-craft/platform-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminKeys } from "../../common/react/keys";
import { useAdminClient } from "../../common/react/provider";

/** The user directory. */
export function useAdminUsers(query?: UserListInput) {
  const client = useAdminClient();
  return useQuery({
    queryKey: [...adminKeys.users.list(), query ?? null],
    queryFn: () => client.users.list(query),
  });
}

export function useAdminUser(userId: string | null | undefined) {
  const client = useAdminClient();
  return useQuery({
    queryKey: adminKeys.users.detail(userId ?? ""),
    queryFn: () => client.users.findById(userId as string),
    enabled: !!userId,
  });
}

/** The console's half of removing an identity; see `AdminUserClient.delete`. */
export function useDeleteAdminUser() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => client.users.delete(userId),
    onSuccess: (_data, userId) => {
      void qc.invalidateQueries({ queryKey: adminKeys.users.list() });
      void qc.removeQueries({ queryKey: adminKeys.users.detail(userId) });
      // A deleted person leaves every roster they were on.
      void qc.invalidateQueries({ queryKey: adminKeys.members.all() });
    },
  });
}
