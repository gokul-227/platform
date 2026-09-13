"use client";

import { Spinner } from "@aec-craft/ui/components/custom/spinner";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { Skeleton } from "@aec-craft/ui/components/primitives/skeleton";
import type { ReactNode } from "react";

import { useFileLevel } from "../../react/file.hooks";
import { FolderDraftRow } from "./file.draft";
import { COLUMN_COUNT, indent } from "./file.grid";
import { FileRows } from "./file.row";
import { useFileBrowser } from "./provider";
import { useCreatorNames } from "./use-creator-names";

/**
 * The children of one folder, as rows in the same grid as everything else. Each
 * level owns its query and its paging: several folders are open at once, so
 * "load more" belongs to the level it grows rather than to the tree.
 */
export function FileLevel({
  parentId,
  depth,
  ancestors,
}: {
  ancestors: readonly string[];
  depth: number;
  parentId: string;
}) {
  const { draft, fileScope, listQuery } = useFileBrowser();
  const level = useFileLevel(fileScope, { ...listQuery, parentId });
  const rows = level.data?.pages.flatMap((page) => page.items) ?? [];
  const creators = useCreatorNames(rows);
  const isDrafting = draft?.parentId === parentId;

  if (level.isPending) {
    return (
      <LevelRow depth={depth}>
        <Skeleton className="h-4 w-32" />
      </LevelRow>
    );
  }

  if (level.error) {
    return (
      <LevelRow depth={depth}>
        <span className="text-muted-foreground text-xs">
          We couldn't open this folder.
        </span>
        <Button
          className="text-muted-foreground"
          onClick={() => level.refetch()}
          size="sm"
          variant="ghost"
        >
          Try again
        </Button>
      </LevelRow>
    );
  }

  if (rows.length === 0 && !isDrafting) {
    return (
      <LevelRow depth={depth}>
        <span className="text-muted-foreground text-xs">Empty folder.</span>
      </LevelRow>
    );
  }

  return (
    <>
      {isDrafting ? <FolderDraftRow depth={depth} /> : null}
      {rows.map((file) => (
        <FileRows
          ancestors={ancestors}
          creator={file.createdBy ? creators.get(file.createdBy) : undefined}
          depth={depth}
          file={file}
          key={file.id}
        />
      ))}
      {level.hasNextPage ? (
        <LevelRow depth={depth}>
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
              `Load more (${rows.length} of ${level.data?.pages[0]?.total ?? rows.length})`
            )}
          </Button>
        </LevelRow>
      ) : null}
    </>
  );
}

/** A level's own status row, indented to sit under its folder. */
function LevelRow({ depth, children }: { children: ReactNode; depth: number }) {
  return (
    <tr className="border-foreground/6 border-b last:border-b-0">
      <td className="px-4 py-2" colSpan={COLUMN_COUNT}>
        <div className="flex items-center gap-2" style={indent(depth + 1)}>
          {children}
        </div>
      </td>
    </tr>
  );
}
