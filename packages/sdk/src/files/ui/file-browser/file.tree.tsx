"use client";

import { EmptyState } from "@aec-craft/ui/components/blocks/empty-state";
import { Spinner } from "@aec-craft/ui/components/custom/spinner";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { Skeleton } from "@aec-craft/ui/components/primitives/skeleton";
import {
  FolderIcon,
  FolderPlusIcon,
  UploadSimpleIcon,
} from "@aec-craft/ui/icons";
import { cn } from "@aec-craft/ui/lib/utils";

import { SectionError } from "../../../common/ui/states";
import { useFileLevel } from "../../react/file.hooks";
import { FolderDraftRow } from "./file.draft";
import { COLUMN_COUNT, COLUMNS, GRID_TEMPLATE } from "./file.grid";
import { FileMoveDialog } from "./file.move.dialog";
import { FileSearchResults } from "./file.results";
import { FileRows } from "./file.row";
import { FileSearchField } from "./file.search";
import { useFileBrowser } from "./provider";
import { useCreatorNames } from "./use-creator-names";
import { type DropZone, useDropZone } from "./use-drop-zone";

/**
 * The tree: rows from every open level as siblings in one table body, each laid
 * out on the shared grid, with the name cell carrying the indentation that says
 * where it sits. `aria-level` and `aria-expanded` describe the nesting the
 * layout implies.
 *
 * Dropping a row on a folder moves it there; the strip under the tree is the
 * scope root, which is how something leaves the folder it is in.
 */
export function FileTree() {
  const { canWrite, draft, dragging, fileScope, listQuery, search } =
    useFileBrowser();
  const isSearching = search !== "";
  const level = useFileLevel(fileScope, listQuery);
  const rows = level.data?.pages.flatMap((page) => page.items) ?? [];
  const creators = useCreatorNames(rows);
  const root = useDropZone({ parentId: null });
  const total = level.data?.pages[0]?.total ?? rows.length;

  if (level.error) {
    return (
      <SectionError
        error={level.error}
        onRetry={() => level.refetch()}
        subject="these files"
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <FileSearchField />
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-foreground/10 transition-colors",
          root.isActive && "border-foreground/25 bg-foreground/[0.03]",
          dragging && "select-none"
        )}
      >
        {/* Only the rows scroll: the header stays readable and the actions stay
            reachable, however deep the tree is opened. No `scroll-slim` here,
            which reserves a gutter the whole width would otherwise lose to; the
            base scrollbar is already slim and takes space only when it appears. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full">
            {/* Sticky on the row group, not on the row: a `tr` inside a
                table-header-group does not take sticky positioning. Opaque
                rather than blurred, because rows pass under it and because a
                backdrop filter escapes the frame's rounded clip. */}
            <thead className="sticky top-0 z-10 bg-muted">
              <tr
                className={cn(
                  GRID_TEMPLATE,
                  "border-foreground/10 border-b px-4 py-2 font-medium text-[11px] text-muted-foreground"
                )}
              >
                {COLUMNS.map((column) => (
                  <th
                    className={cn(
                      "font-medium",
                      column.align === "right" ? "text-right" : "text-left"
                    )}
                    key={column.id}
                    scope="col"
                  >
                    {column.hideLabel ? (
                      <span className="sr-only">{column.label}</span>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isSearching ? <FileSearchResults /> : null}

              {isSearching || draft?.parentId !== null ? null : (
                <FolderDraftRow depth={0} />
              )}

              {!isSearching && fileScope && level.isPending ? (
                <LoadingRows />
              ) : null}

              {!(isSearching || level.isPending || draft) &&
              rows.length === 0 ? (
                <tr>
                  <td className="p-8" colSpan={COLUMN_COUNT}>
                    <EmptyState
                      description={
                        canWrite
                          ? "Upload a file, or drop one on the strip below."
                          : "Nothing has been uploaded here."
                      }
                      icon={FolderIcon}
                      title="Nothing here yet."
                      variant="dashed"
                    />
                  </td>
                </tr>
              ) : null}

              {isSearching
                ? null
                : rows.map((file) => (
                    <FileRows
                      ancestors={[]}
                      creator={
                        file.createdBy
                          ? creators.get(file.createdBy)
                          : undefined
                      }
                      depth={0}
                      file={file}
                      key={file.id}
                    />
                  ))}

              {!isSearching && level.hasNextPage ? (
                <tr className="border-foreground/10 border-t">
                  <td className="p-2" colSpan={COLUMN_COUNT}>
                    <div className="flex justify-center">
                      <Button
                        className="text-muted-foreground"
                        disabled={level.isFetchingNextPage}
                        onClick={() => level.fetchNextPage()}
                        size="sm"
                        variant="ghost"
                      >
                        {level.isFetchingNextPage ? (
                          <Spinner className="size-4" />
                        ) : (
                          `Load more (${rows.length} of ${total})`
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {canWrite && !isSearching ? <RootActions dropZone={root} /> : null}
      </div>

      <FileMoveDialog />
    </>
  );
}

/**
 * Everything that acts on the scope root, on one line under the tree: the drop
 * target a row goes to when it leaves a folder, which is also where files
 * dragged in from outside land, and creating a folder at the top level.
 *
 * The drop target is a button so a click reaches it too, the way
 * `<UploadDropzone>` is built: drag handlers on a static element are pointer-only.
 */
function RootActions({ dropZone }: { dropZone: DropZone }) {
  const { dragging, requestUpload, startDraft, uploadsUnavailable } =
    useFileBrowser();

  return (
    <div className="flex items-stretch border-foreground/10 border-t border-dashed">
      <button
        className={cn(
          "flex min-w-0 flex-1 items-center justify-center gap-2 px-4 py-3 text-muted-foreground text-xs transition-colors hover:bg-foreground/[0.03] hover:text-foreground",
          dropZone.isActive && "bg-foreground/[0.06] text-foreground"
        )}
        disabled={uploadsUnavailable && !dragging}
        onClick={() => requestUpload(null)}
        onDragLeave={dropZone.onDragLeave}
        onDragOver={dropZone.onDragOver}
        onDrop={dropZone.onDrop}
        type="button"
      >
        <UploadSimpleIcon className="size-4" />
        {dragging
          ? `Move “${dragging.name}” to the top level`
          : "Drop files here, or click to upload"}
      </button>
      <button
        className="flex shrink-0 items-center gap-2 border-foreground/10 border-l border-dashed px-4 py-3 text-muted-foreground text-xs transition-colors hover:bg-foreground/[0.03] hover:text-foreground"
        onClick={() => startDraft(null)}
        type="button"
      >
        <FolderPlusIcon className="size-4" />
        New folder
      </button>
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((row) => (
        <tr
          className={cn(
            GRID_TEMPLATE,
            "border-foreground/6 border-b px-4 py-2.5 last:border-b-0"
          )}
          key={row}
        >
          <td>
            <Skeleton className="h-4 w-40" />
          </td>
          <td>
            <Skeleton className="h-4 w-8 justify-self-end" />
          </td>
          <td>
            <Skeleton className="h-4 w-14" />
          </td>
          <td>
            <Skeleton className="h-4 w-14" />
          </td>
          <td>
            <Skeleton className="h-4 w-20" />
          </td>
          <td>
            <Skeleton className="size-2 justify-self-center rounded-full" />
          </td>
          <td />
        </tr>
      ))}
    </>
  );
}
