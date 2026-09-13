"use client";

import { useQuery } from "@tanstack/react-query";

import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type { PlatformClient } from "../../index";

type AnalysisKind = keyof PlatformClient["analysis"];

/**
 * One analysis, as a query rather than a mutation: it is a `POST` because the
 * question is the body, but it reads and returns the same answer for the same
 * input, so it caches like a read.
 *
 * Keyed on the input, so changing the question is a new entry rather than an
 * invalidation, and two surfaces asking the same thing share one request.
 */
export function useAnalysis<K extends AnalysisKind>(
  kind: K,
  projectId: string | null | undefined,
  input: Parameters<PlatformClient["analysis"][K]>[1] | null | undefined
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: platformKeys.analysis.run(projectId ?? "", kind, input ?? null),
    queryFn: () =>
      (
        client.analysis[kind] as (
          p: string,
          i: unknown
        ) => Promise<ReturnType<PlatformClient["analysis"][K]>>
      )(projectId as string, input),
    enabled: !!projectId && input != null,
  });
}
