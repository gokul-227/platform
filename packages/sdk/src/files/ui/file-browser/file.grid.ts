/**
 * The tree's row geometry. Every row is the same grid, so the columns line up
 * down the whole tree while the name cell alone absorbs the indentation.
 *
 * Laid on `<tr>`, which the table would otherwise size column by column: rows
 * at different depths are siblings in one `<tbody>`, and a table's own layout
 * has no notion of the indentation that tells them apart.
 */
export const GRID_TEMPLATE =
  "grid grid-cols-[minmax(0,1fr)_4rem_6rem_6rem_9rem_1.25rem_2.25rem] items-center gap-3";

export interface FileColumn {
  /** Numbers read from the right; everything else from the left. */
  align?: "right";
  /** The cell is a mark, so its label is for anything that cannot see one. */
  hideLabel?: boolean;
  id: string;
  label: string;
}

export const COLUMNS: readonly FileColumn[] = [
  { id: "name", label: "Name" },
  { id: "size", label: "Size", align: "right" },
  { id: "modified", label: "Modified" },
  { id: "created", label: "Created" },
  { id: "creator", label: "Created by" },
  { id: "status", label: "Status", hideLabel: true },
  { id: "actions", label: "", hideLabel: true },
];

export const COLUMN_COUNT = COLUMNS.length;

/** Indentation per level. Depth is unbounded, so this is inline, not a class. */
export function indent(depth: number): { paddingInlineStart: string } {
  return { paddingInlineStart: `${depth * 1.25}rem` };
}

/** Folders lead, then names: `folder` precedes `file` descending, lexically. */
export const FOLDERS_FIRST = ["type:desc", "name:asc"];

/** The scope root as a drop target, alongside the folder ids. */
export const ROOT_DROP = "root";
