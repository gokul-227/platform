"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type { CreateOrgInput, OrgListInput, UpdateOrgInput } from "../../index";

export function useOrgs(query?: OrgListInput) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: [...platformKeys.orgs.list(), query ?? null],
    queryFn: () => client.orgs.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useOrg(orgId: string | null | undefined) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: platformKeys.orgs.detail(orgId ?? ""),
    queryFn: () => client.orgs.findById(orgId!),
    enabled: !!orgId,
  });
}

export function useCreateOrg() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrgInput) => client.orgs.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.orgs.all() });
    },
  });
}

export function useUpdateOrg() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, input }: { orgId: string; input: UpdateOrgInput }) =>
      client.orgs.update(orgId, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: platformKeys.orgs.list() });
      void qc.invalidateQueries({
        queryKey: platformKeys.orgs.detail(vars.orgId),
      });
    },
  });
}

export function useDeleteOrg() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string) => client.orgs.delete(orgId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.orgs.all() });
    },
  });
}

/** Merge-write one metadata key (dotted path) on an org. Requires `org:update`. */
export function useSetOrgMetadata() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      keyPath,
      value,
    }: {
      orgId: string;
      keyPath: string;
      value: unknown;
    }) => client.orgs.metadata.set(orgId, keyPath, value),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: platformKeys.orgs.list() });
      void qc.invalidateQueries({
        queryKey: platformKeys.orgs.detail(vars.orgId),
      });
    },
  });
}

/** Remove one metadata key (dotted path) from an org. Requires `org:update`. */
export function useDeleteOrgMetadata() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, keyPath }: { orgId: string; keyPath: string }) =>
      client.orgs.metadata.delete(orgId, keyPath),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: platformKeys.orgs.list() });
      void qc.invalidateQueries({
        queryKey: platformKeys.orgs.detail(vars.orgId),
      });
    },
  });
}
