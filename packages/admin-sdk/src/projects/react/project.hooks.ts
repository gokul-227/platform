"use client";

import type {
  ProjectListInput,
  UpdateProjectInput,
} from "@aec-craft/platform-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminKeys } from "../../common/react/keys";
import { useAdminClient } from "../../common/react/provider";

export function useAdminProjects(query?: ProjectListInput) {
  const client = useAdminClient();
  return useQuery({
    queryKey: [...adminKeys.projects.list(), query ?? null],
    queryFn: () => client.projects.list(query),
  });
}

export function useAdminOrgProjects(
  orgId: string | null | undefined,
  query?: ProjectListInput
) {
  const client = useAdminClient();
  return useQuery({
    queryKey: [...adminKeys.projects.byOrg(orgId ?? ""), query ?? null],
    queryFn: () => client.projects.listByOrg(orgId as string, query),
    enabled: !!orgId,
  });
}

export function useAdminProject(projectId: string | null | undefined) {
  const client = useAdminClient();
  return useQuery({
    queryKey: adminKeys.projects.detail(projectId ?? ""),
    queryFn: () => client.projects.findById(projectId as string),
    enabled: !!projectId,
  });
}

export function useUpdateAdminProject() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { input: UpdateProjectInput; projectId: string }) =>
      client.projects.update(vars.projectId, vars.input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: adminKeys.projects.list() });
      void qc.invalidateQueries({
        queryKey: adminKeys.projects.detail(vars.projectId),
      });
    },
  });
}
