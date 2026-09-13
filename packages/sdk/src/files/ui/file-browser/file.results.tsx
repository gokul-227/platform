"use client";

import { EmptyState } from "@aec-craft/ui/components/blocks/empty-state";
import { Spinner } from "@aec-craft/ui/components/custom/spinner";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { MagnifyingGlassIcon } from "@aec-craft/ui/icons";
import { cn } from "@aec-craft/ui/lib/utils";

import { SectionError } from "../../../common/ui/states";
import type { FileResponse } from "../../../index";
import { useFileLevel } from "../../react/file.hooks";
import { COLUMN_COUNT, GRID_TEMPLATE } from "./file.grid";
import { iconFor } from "./file.icon";
import { FileMetaCells } from "./file.row";
import { Highlight } from "./file.search";
import { useFileBrowser } from "./provider";
import { useCreatorNames } from "./use-creator-names";

/**
 * What the search found, anywhere in the scope, as a flat list.
 *
 * Flat rather than a filtered tree: a hit three folders down would otherwise
 * need its ancestors drawn around it, and the ancestors are not matches. Each
 * row names where it lives instead, and opens the tree there.
 */
export function FileSearchResults() {
  const { fileScope, listQuery, reveal, search } = useFileBrowser();
  const results = useFileLevel(fileScope, {
    ...listQuery,
    recursive: true,
    name: `contains.${search}`,
  });
  const rows = results.data?.pages.flatMap((page) => page.items) ?? [];
  const creators = useCreatorNames(rows);
  const total = results.data?.pages[0]?.total ?? rows.length;

  if (results.error) {
    return (
      <tr>
        <td className="p-4" colSpan={COLUMN_COUNT}>
          <SectionError
            error={results.error}
            onRetry={() => results.refetch()}
            subject="these results"
          />
        </td>
      </tr>
    );
  }

  if (results.isPending) {
    return (
      <tr>
        <td className="p-8" colSpan={COLUMN_COUNT}>
          <div className="flex justify-center">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        </td>
      </tr>
    );
  }

  if (rows.length === 0) {
    return (
      <tr>
        <td className="p-8" colSpan={COLUMN_COUNT}>
          <EmptyState
            description="No file or folder here has that in its name."
            icon={MagnifyingGlassIcon}
            title={`Nothing matches “${search}”.`}
            variant="dashed"
          />
        </td>
      </tr>
    );
  }

  return (
    <>
      {rows.map((file) => (
        <ResultRow
          creator={file.createdBy ? creators.get(file.createdBy) : undefined}
          file={file}
          key={file.id}
          needle={search}
          onReveal={() => reveal(file)}
        />
      ))}
      {results.hasNextPage ? (
        <tr className="border-foreground/10 border-t">
          <td className="p-2" colSpan={COLUMN_COUNT}>
            <div className="flex justify-center">
              <Button
                className="text-muted-foreground"
                disabled={results.isFetchingNextPage}
                onClick={() => results.fetchNextPage()}
                size="sm"
                variant="ghost"
              >
                {results.isFetchingNextPage ? (
                  <Spinner className="size-4" />
                ) : (
                  `Load more (${rows.length} of ${total})`
                )}
              </Button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * One hit: its name with the match marked, and the folders it sits in. Clicking
 * it opens the tree at that spot, which is the only navigation a result needs.
 */
function ResultRow({
  creator,
  file,
  needle,
  onReveal,
}: {
  creator: string | undefined;
  file: FileResponse;
  needle: string;
  onReveal: () => void;
}) {
  const Icon = iconFor(file);
  const path = file.path ?? [];

  return (
    <tr
      className={cn(
        GRID_TEMPLATE,
        "border-foreground/6 border-b px-4 py-2 transition-colors last:border-b-0 hover:bg-foreground/[0.025]"
      )}
    >
      <td className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <button
          className="flex min-w-0 flex-col items-start text-left"
          onClick={onReveal}
          type="button"
        >
          <span
            className={cn(
              "max-w-full truncate text-sm hover:underline",
              file.type === "folder" && "font-medium"
            )}
          >
            <Highlight needle={needle} text={file.name} />
          </span>
          <span className="max-w-full truncate text-[11px] text-muted-foreground">
            {path.length === 0
              ? "Top level"
              : path.map((folder) => folder.name).join(" / ")}
          </span>
        </button>
      </td>
      <FileMetaCells creator={creator} file={file} />
    </tr>
  );
}
