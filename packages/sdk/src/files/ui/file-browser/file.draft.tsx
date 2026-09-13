"use client";

import { FolderPlusIcon } from "@aec-craft/ui/icons";
import { toastError } from "@aec-craft/ui/lib/toast";
import { cn } from "@aec-craft/ui/lib/utils";

import { useCreateFolder } from "../../react/file.hooks";
import { GRID_TEMPLATE, indent } from "./file.grid";
import { InlineNameField } from "./file.name-field";
import { useFileBrowser } from "./provider";

/**
 * A folder being named, as a row where it will sit rather than as a dialog over
 * the tree: the name it needs is the only field, and the place it lands is the
 * thing a dialog hides.
 */
export function FolderDraftRow({ depth }: { depth: number }) {
  const { draft, endDraft, fileScope } = useFileBrowser();
  const createFolder = useCreateFolder();

  if (!(draft && fileScope)) {
    return null;
  }

  return (
    <tr
      className={cn(
        GRID_TEMPLATE,
        "border-foreground/6 border-b bg-foreground/[0.02] px-4 py-2 last:border-b-0"
      )}
    >
      <td className="flex min-w-0 items-center gap-1" style={indent(depth)}>
        <span className="size-5 shrink-0" />
        <FolderPlusIcon className="size-4 shrink-0 text-muted-foreground" />
        <InlineNameField
          onCancel={endDraft}
          onCommit={(name) => {
            endDraft();
            createFolder.mutate(
              {
                scope: fileScope,
                input: {
                  name,
                  ...(draft.parentId ? { parentId: draft.parentId } : {}),
                },
              },
              { onError: (error) => toastError(error) }
            );
          }}
          placeholder="Folder name"
        />
      </td>
      <td />
      <td />
      <td />
      <td />
      <td />
      <td />
    </tr>
  );
}
