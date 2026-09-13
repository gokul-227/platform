"use client";

import type {
  AdminCreateOrgInput,
  OrgListInput,
  UpdateOrgInput,
} from "@aec-craft/platform-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminKeys } from "../../common/react/keys";
import { useAdminClient } from "../../common/react/provider";

export function useAdminOrgs(query?: OrgListInput) {
  const client = useAdminClient();
  return useQuery({
    queryKey: [...adminKeys.orgs.list(), query ?? null],
    queryFn: () => client.orgs.list(query),
  });
}

export function useAdminOrg(orgId: string | null | undefined) {
  const client = useAdminClient();
  return useQuery({
    queryKey: adminKeys.orgs.detail(orgId ?? ""),
    queryFn: () => client.orgs.findById(orgId as string),
    enabled: !!orgId,
  });
}

export function useUpdateAdminOrg() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { input: UpdateOrgInput; orgId: string }) =>
      client.orgs.update(vars.orgId, vars.input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: adminKeys.orgs.list() });
      void qc.invalidateQueries({
        queryKey: adminKeys.orgs.detail(vars.orgId),
      });
    },
  });
}

/** Names the owner rather than becoming one; see `AdminOrgClient.create`. */
export function useCreateAdminOrg() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminCreateOrgInput) => client.orgs.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.orgs.list() });
    },
  });
}

export function useDeleteAdminOrg() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string) => client.orgs.delete(orgId),
    onSuccess: (_data, orgId) => {
      void qc.invalidateQueries({ queryKey: adminKeys.orgs.all() });
      void qc.invalidateQueries({ queryKey: adminKeys.members.list(orgId) });
      void qc.invalidateQueries({ queryKey: adminKeys.projects.byOrg(orgId) });
    },
  });
}
