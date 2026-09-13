"use client";

import type { DragEvent } from "react";

import type { FileResponse } from "../../../index";
import { ROOT_DROP } from "./file.grid";
import { useFileBrowser } from "./provider";

export interface DropZone {
  /** Something acceptable is over this zone right now. */
  isActive: boolean;
  onDragLeave: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

/**
 * A folder (or the scope root) as a destination, for a row dragged within the
 * tree and for files dragged in from outside it.
 *
 * `ancestors` is what makes a folder refuse its own subtree: a client cannot ask
 * whether one row descends from another, but the level that rendered this row
 * walked past every folder above it, so the chain is already known here.
 */
export function useDropZone({
  parentId,
  ancestors = [],
}: {
  ancestors?: readonly string[];
  /** The folder this zone drops into; `null` is the scope root. */
  parentId: string | null;
}): DropZone {
  const {
    canWrite,
    dragging,
    dropTarget,
    moveInto,
    setDragging,
    setDropTarget,
    startUpload,
    uploadsUnavailable,
  } = useFileBrowser();
  const key = parentId ?? ROOT_DROP;

  const accepts = (event: DragEvent): "move" | "upload" | null => {
    if (!canWrite) {
      return null;
    }
    if (event.dataTransfer.types.includes("Files")) {
      return uploadsUnavailable ? null : "upload";
    }
    return canMove(dragging, parentId, ancestors) ? "move" : null;
  };

  return {
    isActive: dropTarget === key,
    onDragOver: (event) => {
      const intent = accepts(event);
      if (!intent) {
        return;
      }
      // Both calls are the "yes, drop here" answer: without them the browser
      // keeps its no-drop cursor and never fires a drop event.
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = intent === "move" ? "move" : "copy";
      setDropTarget(key);
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (event) => {
      const intent = accepts(event);
      setDropTarget(null);
      if (!intent) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (intent === "upload") {
        startUpload(parentId, [...event.dataTransfer.files]);
        return;
      }
      if (dragging) {
        moveInto(dragging, parentId);
      }
      setDragging(null);
    },
  };
}

function canMove(
  dragging: FileResponse | null,
  parentId: string | null,
  ancestors: readonly string[]
): boolean {
  if (!dragging) {
    return false;
  }
  // Already there, into itself, or into its own subtree.
  return (
    dragging.parentId !== parentId &&
    dragging.id !== parentId &&
    !ancestors.includes(dragging.id)
  );
}
