"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type {
  CreateProjectInput,
  ProjectListInput,
  UpdateProjectInput,
} from "../../index";

/** Admin-only — every project across every org. */
export function useProjects(query?: ProjectListInput) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: [...platformKeys.projects.list(), query ?? null],
    queryFn: () => client.projects.list(query),
    placeholderData: keepPreviousData,
  });
}

/** Projects under a single org. */
export function useProjectsByOrg(
  orgId: string | null | undefined,
  query?: ProjectListInput
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: [...platformKeys.projects.listByOrg(orgId ?? ""), query ?? null],
    queryFn: () => client.projects.listByOrg(orgId!, query),
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });
}

export function useProject(projectId: string | null | undefined) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: platformKeys.projects.detail(projectId ?? ""),
    queryFn: () => client.projects.findById(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      input,
    }: {
      orgId: string;
      input: CreateProjectInput;
    }) => client.projects.create(orgId, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: platformKeys.projects.all() });
      void qc.invalidateQueries({
        queryKey: platformKeys.projects.listByOrg(vars.orgId),
      });
    },
  });
}

export function useUpdateProject() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: UpdateProjectInput;
    }) => client.projects.update(projectId, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: platformKeys.projects.all() });
      void qc.invalidateQueries({
        queryKey: platformKeys.projects.detail(vars.projectId),
      });
    },
  });
}

export function useDeleteProject() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => client.projects.delete(projectId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.projects.all() });
    },
  });
}

/** Merge-write one metadata key (dotted path) on a project. Requires `project:update`. */
export function useSetProjectMetadata() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      keyPath,
      value,
    }: {
      projectId: string;
      keyPath: string;
      value: unknown;
    }) => client.projects.metadata.set(projectId, keyPath, value),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: platformKeys.projects.all() });
      void qc.invalidateQueries({
        queryKey: platformKeys.projects.detail(vars.projectId),
      });
    },
  });
}

/** Remove one metadata key (dotted path) from a project. Requires `project:update`. */
export function useDeleteProjectMetadata() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      keyPath,
    }: {
      projectId: string;
      keyPath: string;
    }) => client.projects.metadata.delete(projectId, keyPath),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: platformKeys.projects.all() });
      void qc.invalidateQueries({
        queryKey: platformKeys.projects.detail(vars.projectId),
      });
    },
  });
}
