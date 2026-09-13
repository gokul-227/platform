"use client";

import type {
  FailedUpload,
  FileResponse,
  FileScope,
} from "@aec-craft/platform-contracts";
import { UploadSimpleIcon } from "@aec-craft/ui/icons";
import { cn } from "@aec-craft/ui/lib/utils";
import { useState } from "react";

import { formatBytes } from "./upload-attachment";
import { UploadFilePicker } from "./upload-file-picker";
import { UploadStatusList } from "./upload-status-list";
import { useUploadSurface } from "./use-upload-surface";

export interface UploadDropzoneProps {
  /** Restrict the picker (`accept` on the file input), e.g. `".ifc,image/*"`. */
  accept?: string;
  className?: string;
  description?: string;
  /** Allow more than one file per drop. Default true. */
  multiple?: boolean;
  onError?: (state: FailedUpload) => void;
  onUploaded?: (file: FileResponse) => void;
  /** Folder to upload into; omit for the scope root. */
  parentId?: string | null;
  /** Named upload configuration to be held to, at both ends. Default `default`. */
  preset?: string;
  scope: FileScope;
}

/**
 * Drop or pick files and watch them go up: one row per file with its own
 * progress and controls, so a paused or failed upload never blocks the rest.
 * Large files upload in chunks and can be paused and resumed.
 *
 *   <UploadDropzone scope={{ type: "project", projectId }} parentId={folderId} />
 *
 * `<UploadButton>` is the same thing without the drop target, for a toolbar.
 */
export function UploadDropzone({
  scope,
  parentId,
  preset,
  accept,
  multiple = true,
  description,
  onUploaded,
  onError,
  className,
}: UploadDropzoneProps): React.ReactElement {
  const [isDragging, setIsDragging] = useState(false);
  const surface = useUploadSurface({
    scope,
    multiple,
    ...(parentId === undefined ? {} : { parentId }),
    ...(preset === undefined ? {} : { preset }),
    ...(onUploaded ? { onUploaded } : {}),
    ...(onError ? { onError } : {}),
  });

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <button
        aria-label="Upload files"
        className={cn(
          "flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center transition-colors",
          "hover:bg-foreground/[0.03] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
          isDragging && "border-foreground/40 bg-foreground/[0.05]",
          surface.isUnavailable && "pointer-events-none opacity-50"
        )}
        disabled={surface.isUnavailable}
        onClick={surface.openPicker}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          surface.submit([...event.dataTransfer.files]);
        }}
        type="button"
      >
        <UploadSimpleIcon className="size-5 text-muted-foreground" />
        <span className="font-medium text-sm">
          Drop files here, or click to choose
        </span>
        <span className="text-muted-foreground text-xs">
          {description ?? hint(surface.isUnavailable, surface.maxBytes)}
        </span>
      </button>

      <UploadFilePicker
        multiple={multiple}
        onFiles={surface.submit}
        pickerRef={surface.pickerRef}
        {...(accept ? { accept } : {})}
      />

      {surface.rejected && (
        <p className="text-destructive text-xs" role="alert">
          {surface.rejected}
        </p>
      )}

      <UploadStatusList uploads={surface.uploads} />
    </div>
  );
}

function hint(isUnavailable: boolean, maxBytes: number | undefined): string {
  if (isUnavailable) {
    return "File storage is not configured for this environment";
  }
  return maxBytes ? `Up to ${formatBytes(maxBytes)} per file` : " ";
}
