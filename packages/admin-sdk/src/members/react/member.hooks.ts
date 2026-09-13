"use client";

import type {
  CreateMemberInput,
  GroupStanding,
  MemberListQuery,
} from "@aec-craft/platform-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminKeys } from "../../common/react/keys";
import { useAdminClient } from "../../common/react/provider";

/** One organization's roster, unmasked. Organizations only, as the client. */
export function useAdminMembers(
  orgId: string | null | undefined,
  query: MemberListQuery = {}
) {
  const client = useAdminClient();
  return useQuery({
    queryKey: [...adminKeys.members.list(orgId ?? ""), query],
    queryFn: () => client.members.list(orgId as string, query),
    enabled: !!orgId,
  });
}

export function useAddAdminMember() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { input: CreateMemberInput; orgId: string }) =>
      client.members.add(vars.orgId, vars.input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: adminKeys.members.list(vars.orgId),
      });
    },
  });
}

export function useSetAdminMemberStanding() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      orgId: string;
      standing: GroupStanding;
      subject: string;
    }) => client.members.setStanding(vars.orgId, vars.subject, vars.standing),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: adminKeys.members.list(vars.orgId),
      });
    },
  });
}

export function useRemoveAdminMember() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orgId: string; subject: string }) =>
      client.members.remove(vars.orgId, vars.subject),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: adminKeys.members.list(vars.orgId),
      });
    },
  });
}
