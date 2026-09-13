"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type { AuditEventListInput } from "../../index";

/**
 * Audit-log hooks (read-only — audit rows are emitted server-side, never by
 * clients). `useOrgAuditEvents` / `useProjectAuditEvents` for one page of a
 * scoped feed, `useOrgAuditFeed` / `useProjectAuditFeed` to walk the whole log
 * by cursor, plus per-event detail hooks for deep-linking from the audit table.
 */

export function useOrgAuditEvents(
  orgId: string | null | undefined,
  query?: AuditEventListInput
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: [...platformKeys.audit.listForOrg(orgId ?? ""), query ?? null],
    queryFn: ({ signal }) =>
      client.audit.list({ type: "org", orgId: orgId! }, query, { signal }),
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });
}

export function useOrgAuditEvent(
  orgId: string | null | undefined,
  eventId: string | null | undefined
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: platformKeys.audit.detailForOrg(orgId ?? "", eventId ?? ""),
    queryFn: () =>
      client.audit.findById({ type: "org", orgId: orgId! }, eventId!),
    enabled: !!orgId && !!eventId,
  });
}

export function useProjectAuditEvents(
  projectId: string | null | undefined,
  query?: AuditEventListInput
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: [
      ...platformKeys.audit.listForProject(projectId ?? ""),
      query ?? null,
    ],
    queryFn: ({ signal }) =>
      client.audit.list({ type: "project", projectId: projectId! }, query, {
        signal,
      }),
    enabled: !!projectId,
    placeholderData: keepPreviousData,
  });
}

export function useProjectAuditEvent(
  projectId: string | null | undefined,
  eventId: string | null | undefined
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: platformKeys.audit.detailForProject(
      projectId ?? "",
      eventId ?? ""
    ),
    queryFn: () =>
      client.audit.findById(
        { type: "project", projectId: projectId! },
        eventId!
      ),
    enabled: !!projectId && !!eventId,
  });
}

/**
 * A whole scoped feed, one cursor page at a time. Rows are
 * `data.pages.flatMap((page) => page.items)` and `hasNextPage` says whether the
 * log continues.
 *
 * Cursor rather than offset, which is what a log wants: a page is pinned to the
 * keyset it was read at, so an event written while somebody reads does not shift
 * a row from one page into the next.
 */
export function useOrgAuditFeed(
  orgId: string | null | undefined,
  query?: Omit<AuditEventListInput, "cursor" | "page" | "pageSize">
) {
  const client = usePlatformClient();
  return useInfiniteQuery({
    queryKey: [
      ...platformKeys.audit.listForOrg(orgId ?? ""),
      "feed",
      query ?? null,
    ],
    queryFn: ({ pageParam, signal }) =>
      client.audit.list(
        { type: "org", orgId: orgId as string },
        { ...query, ...(pageParam ? { cursor: pageParam } : {}) },
        { signal }
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });
}

/** `useOrgAuditFeed` for a project's feed. */
export function useProjectAuditFeed(
  projectId: string | null | undefined,
  query?: Omit<AuditEventListInput, "cursor" | "page" | "pageSize">
) {
  const client = usePlatformClient();
  return useInfiniteQuery({
    queryKey: [
      ...platformKeys.audit.listForProject(projectId ?? ""),
      "feed",
      query ?? null,
    ],
    queryFn: ({ pageParam, signal }) =>
      client.audit.list(
        { type: "project", projectId: projectId as string },
        { ...query, ...(pageParam ? { cursor: pageParam } : {}) },
        { signal }
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!projectId,
    placeholderData: keepPreviousData,
  });
}
