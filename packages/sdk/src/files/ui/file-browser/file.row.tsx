"use client";

import {
  CaretDownIcon,
  CaretRightIcon,
  FolderIcon,
  FolderOpenIcon,
} from "@aec-craft/ui/icons";
import { relativeTime } from "@aec-craft/ui/lib/format";
import { toastError } from "@aec-craft/ui/lib/toast";
import { cn } from "@aec-craft/ui/lib/utils";
import { useCallback, useEffect, useRef } from "react";

import type { FileResponse } from "../../../index";
import { useUpdateFile } from "../../react/file.hooks";
import { formatBytes } from "../upload-attachment";
import { FileActions } from "./file.actions";
import { GRID_TEMPLATE, indent } from "./file.grid";
import { iconFor } from "./file.icon";
import { FileLevel } from "./file.level";
import { InlineNameField } from "./file.name-field";
import { FileStatusDot } from "./file.status";
import { useFileBrowser } from "./provider";
import { useDropZone } from "./use-drop-zone";

/** How long a dragged row has to hover a closed folder before it opens. */
const HOVER_OPEN_MS = 700;

/** One entry, plus its children when it is an expanded folder. */
export function FileRows({
  file,
  depth,
  ancestors,
  creator,
}: {
  ancestors: readonly string[];
  creator: string | undefined;
  depth: number;
  file: FileResponse;
}) {
  const { isExpanded, toggle, expand, renamingId, dragging, setDragging } =
    useFileBrowser();
  const isFolder = file.type === "folder";
  const isOpen = isFolder && isExpanded(file.id);
  const isDragged = dragging?.id === file.id;

  // A folder is a destination; a file is not, so its row drops through to the
  // level around it and the whole tree stays one continuous target.
  const drop = useDropZone({
    parentId: isFolder ? file.id : null,
    ancestors: isFolder ? [...ancestors, file.id] : ancestors,
  });
  const isTarget = isFolder && drop.isActive;

  // Dragging onto a closed folder opens it, so a drop can go somewhere deeper
  // than the tree happened to be showing.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHover = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);
  useEffect(() => clearHover, [clearHover]);

  const onDragOver = (event: React.DragEvent) => {
    drop.onDragOver(event);
    if (isFolder && !isOpen && file.hasChildren && !hoverTimer.current) {
      hoverTimer.current = setTimeout(() => {
        expand(file.id);
        clearHover();
      }, HOVER_OPEN_MS);
    }
  };

  return (
    <>
      <tr
        aria-expanded={isFolder ? isOpen : undefined}
        aria-level={depth + 1}
        className={cn(
          GRID_TEMPLATE,
          "border-foreground/6 border-b px-4 py-2 transition-colors last:border-b-0 hover:bg-foreground/[0.025]",
          isDragged && "opacity-40",
          isTarget &&
            "bg-foreground/[0.06] ring-1 ring-foreground/20 ring-inset"
        )}
        draggable={!renamingId}
        onDragEnd={() => {
          clearHover();
          setDragging(null);
        }}
        onDragLeave={() => {
          clearHover();
          drop.onDragLeave();
        }}
        onDragOver={onDragOver}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          // Some browsers refuse to start a drag with no payload at all.
          event.dataTransfer.setData("text/plain", file.name);
          setDragging(file);
        }}
        onDrop={(event) => {
          clearHover();
          drop.onDrop(event);
        }}
      >
        <td className="flex min-w-0 items-center gap-1" style={indent(depth)}>
          {/* Every folder carries a caret, an empty one included but dimmed: a
              blank where its siblings have one reads as "not a folder", and the
              server's hasChildren is what says which is which. */}
          {isFolder ? (
            <button
              aria-label={isOpen ? "Collapse folder" : "Expand folder"}
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground",
                !file.hasChildren && "opacity-35"
              )}
              onClick={() => toggle(file.id)}
              type="button"
            >
              {isOpen ? (
                <CaretDownIcon className="size-3.5" />
              ) : (
                <CaretRightIcon className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="size-5 shrink-0" />
          )}
          <RowIcon file={file} isOpen={isOpen} isTarget={isTarget} />
          {renamingId === file.id ? (
            <RenameField file={file} />
          ) : isFolder ? (
            <button
              className="min-w-0 cursor-pointer truncate text-left font-medium text-sm hover:underline"
              onClick={() => toggle(file.id)}
              type="button"
            >
              {file.name}
            </button>
          ) : (
            <span className="truncate text-sm">{file.name}</span>
          )}
        </td>
        <FileMetaCells creator={creator} file={file} />
      </tr>
      {isOpen ? (
        <FileLevel
          ancestors={[...ancestors, file.id]}
          depth={depth + 1}
          parentId={file.id}
        />
      ) : null}
    </>
  );
}

/** Everything after the name: the same cells wherever a row is listed. */
export function FileMetaCells({
  creator,
  file,
}: {
  creator: string | undefined;
  file: FileResponse;
}) {
  return (
    <>
      <td className="text-right text-muted-foreground text-xs tabular-nums">
        {file.content?.size == null ? "" : formatBytes(file.content.size)}
      </td>
      <TimeCell value={file.updatedAt} />
      <TimeCell value={file.createdAt} />
      <td className="truncate text-muted-foreground text-xs">
        {creator ?? ""}
      </td>
      <td className="flex justify-center">
        <FileStatusDot file={file} />
      </td>
      <td className="flex justify-end">
        <FileActions file={file} />
      </td>
    </>
  );
}

/**
 * A moment, read at the distance it is useful from. `relativeTime` is coarse and
 * turns into a date once a week has passed; the title carries the exact one, so
 * precision is a hover away rather than a column six characters wider.
 */
function TimeCell({ value }: { value: string }) {
  return (
    <td
      className="truncate text-muted-foreground text-xs"
      title={new Date(value).toLocaleString()}
    >
      {relativeTime(value)}
    </td>
  );
}

function RowIcon({
  file,
  isOpen,
  isTarget,
}: {
  file: FileResponse;
  isOpen: boolean;
  isTarget: boolean;
}) {
  if (file.type !== "folder") {
    const Icon = iconFor(file);
    return <Icon className="size-4 shrink-0 text-muted-foreground" />;
  }
  const Icon = isOpen || isTarget ? FolderOpenIcon : FolderIcon;
  return (
    <Icon
      className={cn(
        "size-4 shrink-0",
        isTarget ? "text-foreground" : "text-muted-foreground"
      )}
      weight={isTarget ? "fill" : "regular"}
    />
  );
}

/**
 * Rename in place. Names are unique per folder case-insensitively, so this is
 * where FILE_NAME_CONFLICT surfaces; as a toast rather than a field error, since
 * the field is gone by the time the server answers.
 */
function RenameField({ file }: { file: FileResponse }) {
  const { setRenamingId } = useFileBrowser();
  const update = useUpdateFile();

  return (
    <InlineNameField
      defaultValue={file.name}
      onCancel={() => setRenamingId(null)}
      onCommit={(name) => {
        setRenamingId(null);
        update.mutate(
          { fileId: file.id, input: { name } },
          { onError: (error) => toastError(error) }
        );
      }}
      select={file.type === "file" ? "stem" : "all"}
    />
  );
}
