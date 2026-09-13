"use client";

import { useQuery } from "@tanstack/react-query";

import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type { GraphNodeListInput, Scope } from "../../index";

/** The objects in one scope. Reads only; writes go through the graph hooks. */
export function useObjects(
  scope: Scope | null | undefined,
  query: Omit<GraphNodeListInput, "orgId" | "projectId"> = {}
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: [...platformKeys.objects.list(scope ?? null), query],
    queryFn: () => client.objects.list(scope as Scope, query),
    enabled: !!scope,
  });
}

export function useObject(objectId: string | null | undefined) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: platformKeys.objects.detail(objectId ?? ""),
    queryFn: () => client.objects.findById(objectId as string),
    enabled: !!objectId,
  });
}
