"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@aec-craft/ui/components/primitives/alert-dialog";
import {
  Button,
  buttonVariants,
} from "@aec-craft/ui/components/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@aec-craft/ui/components/primitives/dropdown-menu";
import {
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  PencilSimpleIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@aec-craft/ui/icons";
import { toastError } from "@aec-craft/ui/lib/toast";
import { useState } from "react";

import type { FileResponse } from "../../../index";
import { useDeleteFile, useDownloadFile } from "../../react/file.hooks";
import { useFileBrowser } from "./provider";

export function FileActions({ file }: { file: FileResponse }) {
  const {
    canWrite,
    expand,
    requestUpload,
    setMoving,
    setRenamingId,
    startDraft,
    uploadsUnavailable,
  } = useFileBrowser();
  const download = useDownloadFile();
  const remove = useDeleteFile();
  const [confirming, setConfirming] = useState(false);
  const isFolder = file.type === "folder";

  // Bytes exist only for a file whose upload finished; a folder and a pending
  // row have nothing to hand back.
  const canDownload = file.type === "file" && file.status === "ready";
  if (!(canDownload || canWrite)) {
    return null;
  }

  const startDownload = async () => {
    try {
      const { url } = await download.mutateAsync({ fileId: file.id });
      // The URL is signed and short-lived, so it is followed now rather than
      // held anywhere. A link click keeps the browser out of popup blocking.
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noopener";
      link.target = "_blank";
      link.click();
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button aria-label="File actions" size="icon-sm" variant="ghost" />
          }
        >
          <DotsThreeVerticalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canDownload ? (
            <DropdownMenuItem onClick={startDownload}>
              <DownloadSimpleIcon className="size-4" />
              Download
            </DropdownMenuItem>
          ) : null}
          {canWrite && isFolder ? (
            <>
              <DropdownMenuItem
                disabled={uploadsUnavailable}
                onClick={() => {
                  // Opened so the arriving rows are somewhere the caller can see.
                  expand(file.id);
                  requestUpload(file.id);
                }}
              >
                <UploadSimpleIcon className="size-4" />
                Upload here…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  expand(file.id);
                  startDraft(file.id);
                }}
              >
                <FolderPlusIcon className="size-4" />
                New folder inside
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {canWrite ? (
            <>
              {canDownload ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem onClick={() => setRenamingId(file.id)}>
                <PencilSimpleIcon className="size-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMoving(file)}>
                <FolderOpenIcon className="size-4" />
                Move to…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirming(true)}
                variant="destructive"
              >
                <TrashIcon className="size-4" />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{file.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {file.type === "folder"
                ? "Everything inside this folder goes with it, and the files are removed from storage. This cannot be undone."
                : "The file is removed from storage. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() =>
                remove.mutate(
                  { fileId: file.id },
                  { onError: (error) => toastError(error) }
                )
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
