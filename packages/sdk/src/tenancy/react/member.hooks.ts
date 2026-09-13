"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type {
  CreateMemberInput,
  GroupStanding,
  MemberListQuery,
  Scope,
} from "../../index";

/**
 * Who is in a scope. A project's list carries the people the organization
 * brings into it, marked `inherited`; the organization's carries only its own.
 */
export function useMembers(
  scope: Scope | null | undefined,
  query: MemberListQuery = {}
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: platformKeys.members.list(scope ?? { type: "org", orgId: "" }),
    queryFn: () => client.members.list(scope as Scope, query),
    enabled: !!scope,
  });
}

export function useAddMember() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      input,
    }: {
      scope: Scope;
      input: CreateMemberInput;
    }) => client.members.add(scope, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: platformKeys.members.list(vars.scope),
      });
    },
  });
}

export function useSetMemberStanding() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      subject,
      standing,
    }: {
      scope: Scope;
      subject: string;
      standing: GroupStanding;
    }) => client.members.setStanding(scope, subject, standing),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: platformKeys.members.list(vars.scope),
      });
      // A standing change moves what the caller may do, so the permits a
      // surface renders from have to be refetched too.
      void qc.invalidateQueries({ queryKey: platformKeys.all });
    },
  });
}

export function useRemoveMember() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scope, subject }: { scope: Scope; subject: string }) =>
      client.members.remove(scope, subject),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: platformKeys.members.list(vars.scope),
      });
      // Removing yourself moves your own permits, same as a standing change.
      void qc.invalidateQueries({ queryKey: platformKeys.all });
    },
  });
}
