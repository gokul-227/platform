"use client";

import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aec-craft/ui/components/primitives/dialog";
import {
  CaretDownIcon,
  CaretRightIcon,
  CheckIcon,
  FolderIcon,
  HouseIcon,
} from "@aec-craft/ui/icons";
import { cn } from "@aec-craft/ui/lib/utils";
import { useState } from "react";

import type { FileResponse } from "../../../index";
import { useFileLevel } from "../../react/file.hooks";
import { indent } from "./file.grid";
import { useFileBrowser } from "./provider";

/** Destination picker: the folder tree of the same scope, folders only. */
export function FileMoveDialog() {
  const { moving, setMoving, moveInto } = useFileBrowser();
  // Null is the scope root, which is a valid destination, so "nothing picked
  // yet" is the row the moved entry already sits in.
  const [selected, setSelected] = useState<string | null>(null);

  if (!moving) {
    return null;
  }

  const close = () => {
    setMoving(null);
    setSelected(null);
  };

  // Same move a drag performs, so both report failure the same way.
  const submit = () => {
    moveInto(moving, selected);
    close();
  };

  return (
    <Dialog onOpenChange={(open) => !open && close()} open={true}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move “{moving.name}”</DialogTitle>
          <DialogDescription>
            Pick the folder it should sit in.
          </DialogDescription>
        </DialogHeader>

        <div className="scroll-slim max-h-72 overflow-y-auto rounded-xl border border-foreground/10 p-1">
          <DestinationRow
            depth={0}
            icon={HouseIcon}
            isSelected={selected === null}
            label="Top level"
            onSelect={() => setSelected(null)}
          />
          <FolderList
            depth={1}
            excludeId={moving.type === "folder" ? moving.id : null}
            onSelect={setSelected}
            parentId={undefined}
            selected={selected}
          />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={submit}>Move here</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Folders under `parentId`, lazily. A folder cannot move inside itself, so the
 * moved subtree is left out of the tree entirely rather than rendered disabled:
 * excluding the node excludes everything under it without walking it.
 */
function FolderList({
  parentId,
  depth,
  excludeId,
  selected,
  onSelect,
}: {
  depth: number;
  excludeId: string | null;
  onSelect: (fileId: string) => void;
  parentId: string | undefined;
  selected: string | null;
}) {
  const { fileScope, listQuery } = useFileBrowser();
  const level = useFileLevel(fileScope, {
    ...listQuery,
    ...(parentId === undefined ? {} : { parentId }),
    type: "folder",
  });
  const folders = (
    level.data?.pages.flatMap((page) => page.items) ?? []
  ).filter((folder) => folder.id !== excludeId);

  if (level.isPending) {
    return <p className="px-3 py-2 text-muted-foreground text-xs">Loading…</p>;
  }

  return (
    <>
      {folders.map((folder) => (
        <FolderNode
          depth={depth}
          excludeId={excludeId}
          folder={folder}
          key={folder.id}
          onSelect={onSelect}
          selected={selected}
        />
      ))}
      {level.hasNextPage ? (
        <Button
          className="text-muted-foreground"
          disabled={level.isFetchingNextPage}
          onClick={() => level.fetchNextPage()}
          size="sm"
          variant="ghost"
        >
          Load more folders
        </Button>
      ) : null}
    </>
  );
}

function FolderNode({
  folder,
  depth,
  excludeId,
  selected,
  onSelect,
}: {
  depth: number;
  excludeId: string | null;
  folder: FileResponse;
  onSelect: (fileId: string) => void;
  selected: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <DestinationRow
        depth={depth}
        icon={FolderIcon}
        isOpen={isOpen}
        isSelected={selected === folder.id}
        label={folder.name}
        onSelect={() => onSelect(folder.id)}
        onToggle={folder.hasChildren ? () => setIsOpen(!isOpen) : undefined}
      />
      {isOpen ? (
        <FolderList
          depth={depth + 1}
          excludeId={excludeId}
          onSelect={onSelect}
          parentId={folder.id}
          selected={selected}
        />
      ) : null}
    </>
  );
}

function DestinationRow({
  label,
  depth,
  icon: Icon,
  isSelected,
  isOpen,
  onSelect,
  onToggle,
}: {
  depth: number;
  icon: React.ComponentType<{ className?: string }>;
  isOpen?: boolean;
  isSelected: boolean;
  label: string;
  onSelect: () => void;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-center gap-1" style={indent(depth)}>
      {onToggle ? (
        <button
          aria-label={isOpen ? "Collapse folder" : "Expand folder"}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          onClick={onToggle}
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
      <button
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-foreground/[0.06]",
          isSelected && "bg-foreground/[0.08] font-medium"
        )}
        onClick={onSelect}
        type="button"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
        {isSelected ? <CheckIcon className="size-3.5 shrink-0" /> : null}
      </button>
    </div>
  );
}
