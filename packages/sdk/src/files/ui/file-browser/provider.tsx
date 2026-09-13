"use client";

import { createContext, type ReactNode, useContext } from "react";

import type {
  FileResponse,
  FileScope,
  ProjectFileListInput,
} from "../../../index";

/** The list query every level of one browser shares: order, and the scope narrowing. */
export type FileLevelQuery = Omit<
  ProjectFileListInput,
  "cursor" | "limit" | "page" | "parentId"
>;

/** A folder being named, and where it will sit (`null` is the scope root). */
export interface FolderDraft {
  parentId: string | null;
}

export interface FileBrowserContextValue {
  canWrite: boolean;
  /** The one folder being named, if any. */
  draft: FolderDraft | null;
  /** The row being dragged, for as long as it is in the air. */
  dragging: FileResponse | null;
  /** The folder id under the pointer, or `ROOT_DROP` for the scope root. */
  dropTarget: string | null;
  /** Put the draft row away, named or not. */
  endDraft: () => void;
  expand: (fileId: string) => void;
  /** Null until the active org resolves, which disables every level's query. */
  fileScope: FileScope | null;
  isExpanded: (fileId: string) => boolean;
  listQuery: FileLevelQuery;
  /** Reparent a row. `null` is the scope root. */
  moveInto: (file: FileResponse, parentId: string | null) => void;
  /** The row waiting for a move destination in the picker dialog. */
  moving: FileResponse | null;
  orgId: string | null;
  /** The row whose name is being edited. */
  renamingId: string | null;
  /** Open the file picker with uploads bound to this folder (`null` = root). */
  requestUpload: (parentId: string | null) => void;
  /** Open every folder on the way to a row, and leave the search behind. */
  reveal: (file: FileResponse) => void;
  /** What the tree is filtered to. Below two characters it is not a search. */
  search: string;
  setDragging: (file: FileResponse | null) => void;
  setDropTarget: (target: string | null) => void;
  setMoving: (file: FileResponse | null) => void;
  setRenamingId: (fileId: string | null) => void;
  setSearch: (needle: string) => void;
  /** Open a draft row inside this folder (`null` for the scope root). */
  startDraft: (parentId: string | null) => void;
  /** Upload files the caller already holds, from a drop rather than the picker. */
  startUpload: (parentId: string | null, files: File[]) => void;
  toggle: (fileId: string) => void;
  /** The deployment has no storage backend, so bytes would 503. */
  uploadsUnavailable: boolean;
}

const Ctx = createContext<FileBrowserContextValue | null>(null);

export function FileBrowserProvider({
  value,
  children,
}: {
  children: ReactNode;
  value: FileBrowserContextValue;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFileBrowser(): FileBrowserContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useFileBrowser must be used within <FileBrowser>.");
  }
  return ctx;
}
