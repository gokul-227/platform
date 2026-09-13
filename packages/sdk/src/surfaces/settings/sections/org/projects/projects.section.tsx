"use client";

import { CreateDialog } from "@aec-craft/ui/components/blocks/create-dialog";
import {
  DataTable,
  type DataTableColumn,
  type TableQuery,
} from "@aec-craft/ui/components/blocks/data-table";
import { Section } from "@aec-craft/ui/components/blocks/section";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { TableCell, TableRow } from "@aec-craft/ui/components/primitives/table";
import { ArrowUpRightIcon, CubeIcon, PlusIcon } from "@aec-craft/ui/icons";
import { formatDate } from "@aec-craft/ui/lib/format";
import { useState } from "react";
import { SectionLoading } from "../../../../../common/ui/states";
import { useCreateProject, useProjectsByOrg } from "../../../../../react";
import { useSettings } from "../../../provider";

const PAGE_SIZE = 50;
const MAX_ROWS = 200; // TODO: limit-growth shim; real cursor pagination is a follow-up.

const COLUMNS: DataTableColumn[] = [
  {
    label: "Project",
    key: "name",
    sortable: true,
    filter: { type: "search", placeholder: "Search projects…" },
  },
  { label: "Slug", key: "slug", sortable: true },
  {
    label: "Created",
    key: "createdAt",
    sortable: true,
    className: "text-right",
  },
  { label: "", className: "w-10" },
];

export function OrgProjectsSection() {
  const { orgId, openProject, permits } = useSettings();
  const createProject = useCreateProject();
  const [createOpen, setCreateOpen] = useState(false);
  const canCreate = !!orgId && permits.admin;

  const [tableQuery, setTableQuery] = useState<TableQuery>({
    sort: { key: "name", dir: "asc" },
    filters: {},
  });
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Search + sort + limit go to the server — never the whole project list.
  const search = (tableQuery.filters.name ?? "").trim();
  const projectQuery = {
    sort: tableQuery.sort
      ? [`${tableQuery.sort.key}:${tableQuery.sort.dir}`]
      : undefined,
    pageSize: limit,
    ...(search && { name: `contains.${search}` }),
  };

  const projects = useProjectsByOrg(orgId, projectQuery);
  const isLoading = projects.isLoading;
  const rows = projects.data?.items ?? [];
  const total = projects.data?.total ?? rows.length;
  const hasMore = rows.length < total && limit < MAX_ROWS;

  return (
    <Section
      actions={
        canCreate ? (
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <PlusIcon className="size-4" />
            New project
          </Button>
        ) : undefined
      }
      description="Every project in your organization."
      title="Projects"
    >
      <CreateDialog
        nameLabel="Project name"
        namePlaceholder="My building"
        onCreate={async ({ name }) => {
          if (!orgId) {
            return;
          }
          const created = await createProject.mutateAsync({
            orgId,
            input: { name },
          });
          openProject(created.id, created.name);
        }}
        onOpenChange={setCreateOpen}
        open={createOpen}
        title="Create project"
      />
      {isLoading ? (
        <SectionLoading />
      ) : (
        <DataTable
          columns={COLUMNS}
          empty={
            projects.error
              ? "We couldn't load projects."
              : "No projects match your search."
          }
          hasMore={hasMore}
          isLoadingMore={projects.isFetching}
          onLoadMore={() => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_ROWS))}
          onQueryChange={(q) => {
            setLimit(PAGE_SIZE);
            setTableQuery(q);
          }}
          query={tableQuery}
        >
          {rows.map((p) => (
            <TableRow
              className="cursor-pointer"
              key={p.id}
              onClick={() => openProject(p.id, p.name)}
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-foreground/[0.06] text-muted-foreground">
                    <CubeIcon className="size-4" />
                  </span>
                  <span className="font-medium text-sm">{p.name}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {p.slug}
              </TableCell>
              <TableCell className="text-right text-muted-foreground text-xs">
                {formatDate(p.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <ArrowUpRightIcon className="size-4 text-muted-foreground" />
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
    </Section>
  );
}
