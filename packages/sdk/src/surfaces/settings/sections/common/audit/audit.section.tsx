"use client";

import {
  AUDIT_ACTIONS,
  type AuditEventResponse,
  auditActionLabel,
  resourceLabel,
} from "@aec-craft/platform-contracts";
import {
  DataTable,
  type DataTableColumn,
  type TableQuery,
} from "@aec-craft/ui/components/blocks/data-table";
import { Section } from "@aec-craft/ui/components/blocks/section";
import { TableCell, TableRow } from "@aec-craft/ui/components/primitives/table";
import { CaretDownIcon } from "@aec-craft/ui/icons";
import { relativeTime, titleCase } from "@aec-craft/ui/lib/format";
import { Fragment, useMemo, useState } from "react";
import { SectionError } from "../../../../../common/ui/states";
import {
  useMemberNames,
  useOrgAuditFeed,
  useProjectAuditFeed,
} from "../../../../../react";
import { useSettings } from "../../../provider";
import { AuditDetail } from "./audit.detail";

// Both filters are derived from the actions the platform records, so a new one
// is offerable the moment a module declares it. Hardcoding them left uploads,
// downloads and moves unfilterable long after the events existed.
const VERB_OPTIONS = [...new Set(Object.values(AUDIT_ACTIONS).flat())]
  .sort()
  .map((v) => ({ value: v, label: titleCase(v) }));

const AUDIT_RESOURCES: readonly string[] = Object.keys(AUDIT_ACTIONS);
/**
 * Resources grouped the way the question gets asked. A pick expands to the
 * members, so the server still filters on `resource`, and a family answers
 * "who changed access" without the reader knowing the type names.
 */
const RESOURCE_FAMILIES: readonly { label: string; members: string[] }[] = [
  { label: "Organization", members: ["org", "project"] },
  { label: "Access", members: ["group", "group_member"] },
  { label: "Files", members: ["file", "folder"] },
];

const WINDOWS: readonly { hours: number; label: string; value: string }[] = [
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
];

const PAGE_SIZE = 50;

export function AuditSection() {
  const { scope, orgId, projectId } = useSettings();
  const isProject = scope === "project";

  const [expandedId, setExpandedId] = useState<string | null>(null);
  // No `sort`. This feed pages by cursor, and a cursor page is pinned to the
  // keyset order, so the server rejects `?sort` with a 400 rather than
  // ignoring it. The order it pins to is the spec's `createdAt:desc`, which is
  // the one this table wants anyway.
  const [query, setQuery] = useState<TableQuery>({ filters: {} });

  // Column filters + sort + limit are sent to the server, so we never load the
  // whole log — only the matching, ordered page. A single selected value maps
  // to `eq` (bare shorthand); multiple map to `in.(a,b,c)`.
  const toParam = (v?: string) => {
    const parts = (v ?? "").split(",").filter(Boolean);
    if (parts.length === 0) {
      return;
    }
    return parts.length > 1 ? `in.(${parts.join(",")})` : parts[0];
  };
  // A family option carries its members as its value, so expanding is the same
  // comma split every other filter goes through.
  const since = (value?: string) => {
    const window = WINDOWS.find((w) => w.value === value);
    if (!window) {
      return;
    }
    return `gte.${new Date(Date.now() - window.hours * 3_600_000).toISOString()}`;
  };
  // Typed text, matched against the recorded name rather than every column: a
  // subject is what a reader is looking for, and it is the only free text a row
  // carries.
  const search = (v?: string) => {
    const needle = (v ?? "").trim();
    return needle === "" ? undefined : `contains.${needle}`;
  };
  const auditQuery = {
    limit: PAGE_SIZE,
    ...(since(query.filters.createdAt) && {
      createdAt: since(query.filters.createdAt),
    }),
    ...(toParam(query.filters.actorType) && {
      actorType: toParam(query.filters.actorType),
    }),
    ...(toParam(query.filters.resource) && {
      resource: toParam(query.filters.resource),
    }),
    ...(toParam(query.filters.verb) && { verb: toParam(query.filters.verb) }),
    ...(toParam(query.filters.actorId) && {
      actorId: toParam(query.filters.actorId),
    }),
    ...(search(query.filters.resourceLabel) && {
      resourceLabel: search(query.filters.resourceLabel),
    }),
  };

  const orgAuditEvents = useOrgAuditFeed(isProject ? null : orgId, auditQuery);
  const projAuditEvents = useProjectAuditFeed(
    isProject ? projectId : null,
    auditQuery
  );
  const auditEvents = isProject ? projAuditEvents : orgAuditEvents;

  const events = useMemo(
    () => auditEvents.data?.pages.flatMap((page) => page.items) ?? [],
    [auditEvents.data]
  );

  // Resolve actors to names, so the log never shows a bare id.
  //
  // Through the platform's own `user.id` rather than the subject the provider
  // asserted: a provider swap changes that subject for the same person, which
  // would strand every historical row. The platform id does not move.
  //
  // A row still unresolved is a machine, a `system` action, or somebody who has
  // since left, and its actor type is the honest thing left to say.
  const nameByUserId = useMemberNames(
    isProject && projectId
      ? { type: "project", projectId }
      : orgId
        ? { type: "org", orgId }
        : null
  );
  const actorName = (e: AuditEventResponse) =>
    (e.actorId && nameByUserId.get(e.actorId)) || titleCase(e.actorType);

  /**
   * What the row is about. `resourceLabel` is the recorded answer; a row written
   * before it existed usually still carries the name in its payload, and a
   * membership row carries the person's id, which the same resolve answers.
   */
  const subjectOf = (e: AuditEventResponse): string => {
    if (e.resourceLabel) {
      return e.resourceLabel;
    }
    const payload = (e.payload ?? {}) as {
      after?: { name?: unknown };
      before?: { name?: unknown };
      userId?: unknown;
    };
    const named = payload.after?.name ?? payload.before?.name;
    if (typeof named === "string") {
      return named;
    }
    if (typeof payload.userId === "string") {
      return nameByUserId.get(payload.userId) ?? "";
    }
    return "";
  };

  // Resolves inline rather than through `actorName`, so the memo's dependency
  // on the resolved names is the one it declares. Labels fill in as the names
  // arrive instead of freezing on the first render's fallbacks.
  // Values stay the actor's `user.id`, because that is the column the log
  // filters on; only the label comes from the resolved person. An event with no
  // person behind it (a system action, a machine) offers nothing to filter by
  // and is skipped.'
  const actorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of events) {
      if (e.actorId && !seen.has(e.actorId)) {
        seen.set(
          e.actorId,
          nameByUserId.get(e.actorId) ?? titleCase(e.actorType)
        );
      }
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [events, nameByUserId]);

  const columns: DataTableColumn[] = [
    // What it happened to, first: a reader scanning a log is looking for a
    // thing, and "Standing updated" without a name is the shape of an event
    // rather than the event.
    {
      label: "Subject",
      key: "resourceLabel",
      // Two characters before it asks: one matches most of a log, and every
      // keystroke here is a request.
      filter: { type: "search", minChars: 2, placeholder: "Search subjects…" },
    },
    {
      label: "Event",
      key: "verb",
      filter: {
        type: "select",
        options: VERB_OPTIONS,
        placeholder: "Any event",
      },
    },
    {
      label: "Resource",
      key: "resource",
      filter: {
        type: "select",
        // Families first, then the individual types: the family answers the
        // usual question, and the type is there when somebody knows what they
        // are looking for. A family's value is its members, so one pick becomes
        // `resource=in.(…)` through the same comma split as any other filter.
        options: [
          ...RESOURCE_FAMILIES.filter((family) =>
            family.members.some((m) => AUDIT_RESOURCES.includes(m))
          ).map((family) => ({
            value: family.members
              .filter((m) => AUDIT_RESOURCES.includes(m))
              .join(","),
            label: family.label,
          })),
          ...AUDIT_RESOURCES.map((r) => ({
            value: r,
            label: resourceLabel(r),
          })),
        ],
        placeholder: "Any resource",
      },
    },
    {
      label: "Actor",
      key: "actorId",
      filter: {
        type: "select",
        searchable: true,
        placeholder: "Search people…",
        // The people who appear in the rows loaded so far, rather than the
        // member list: that one offers people who never acted and omits
        // everyone who has since left, so both halves of it were wrong for a
        // filter over this log.
        options: actorOptions,
      },
    },
    {
      label: "When",
      key: "createdAt",
      className: "text-right",
      filter: {
        type: "select",
        options: WINDOWS.map((w) => ({ value: w.value, label: w.label })),
        placeholder: "Any time",
      },
    },
  ];

  return (
    <Section
      description="A running record of who changed what, and when."
      title="Audit log"
    >
      {auditEvents.error ? (
        <SectionError
          error={auditEvents.error}
          onRetry={() => void auditEvents.refetch()}
          subject="the audit log"
        />
      ) : (
        <DataTable
          columns={columns}
          empty="Nothing matches these filters yet."
          hasMore={auditEvents.hasNextPage}
          isLoading={auditEvents.isLoading}
          isLoadingMore={auditEvents.isFetchingNextPage}
          onLoadMore={() => void auditEvents.fetchNextPage()}
          onQueryChange={setQuery}
          query={query}
        >
          {events.map((e) => {
            const open = expandedId === e.id;
            return (
              <Fragment key={e.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => setExpandedId(open ? null : e.id)}
                >
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium text-sm">
                      <CaretDownIcon
                        className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                      />
                      {/* Null on a row written before the name was recorded,
                          which cannot be resolved now: the thing it named may be
                          gone. */}
                      {subjectOf(e)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {auditActionLabel(e)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {resourceLabel(e.resource)}
                  </TableCell>
                  <TableCell className="text-sm">{actorName(e)}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    {relativeTime(e.createdAt)}
                  </TableCell>
                </TableRow>
                {open ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="bg-foreground/[0.02]" colSpan={5}>
                      <AuditDetail event={e} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </DataTable>
      )}
    </Section>
  );
}
