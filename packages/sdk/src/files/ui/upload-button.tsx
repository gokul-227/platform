"use client";

import type {
  FailedUpload,
  FileResponse,
  FileScope,
} from "@aec-craft/platform-contracts";
import { Spinner } from "@aec-craft/ui/components/custom/spinner";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { UploadSimpleIcon } from "@aec-craft/ui/icons";
import { cn } from "@aec-craft/ui/lib/utils";
import type { ReactNode } from "react";

import { UploadFilePicker } from "./upload-file-picker";
import { UploadStatusList } from "./upload-status-list";
import { useUploadSurface } from "./use-upload-surface";

export interface UploadButtonProps {
  /** Restrict the picker (`accept` on the file input), e.g. `".ifc,image/*"`. */
  accept?: string;
  /** Label. Defaults to "Choose file(s)", and to the batch progress while running. */
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  /** Render only the button; drive the list yourself from `useFileUploads`. */
  hideStatus?: boolean;
  /** Allow more than one file per pick. Default true. */
  multiple?: boolean;
  onError?: (state: FailedUpload) => void;
  onUploaded?: (file: FileResponse) => void;
  /** Folder to upload into; omit for the scope root. */
  parentId?: string | null;
  /** Named upload configuration to be held to, at both ends. Default `default`. */
  preset?: string;
  scope: FileScope;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "ghost" | "secondary";
}

/**
 * The compact upload surface: a button that opens the file picker, with the
 * same per-file rows underneath. Same engine as `<UploadDropzone>` — chunked,
 * pausable, resumable — for places a drop target does not fit, like a toolbar.
 *
 *   <UploadButton scope={{ type: "project", projectId }} accept=".ifc">
 *     Add model
 *   </UploadButton>
 */
export function UploadButton({
  scope,
  parentId,
  preset,
  accept,
  multiple = true,
  children,
  disabled,
  hideStatus,
  onUploaded,
  onError,
  variant = "default",
  size = "default",
  className,
}: UploadButtonProps): React.ReactElement {
  const surface = useUploadSurface({
    scope,
    multiple,
    ...(parentId === undefined ? {} : { parentId }),
    ...(preset === undefined ? {} : { preset }),
    ...(onUploaded ? { onUploaded } : {}),
    ...(onError ? { onError } : {}),
  });
  const { isUploading, progress } = surface.uploads;

  return (
    <div className={cn("flex flex-col items-start gap-3", className)}>
      <Button
        disabled={disabled || surface.isUnavailable}
        onClick={surface.openPicker}
        size={size}
        variant={variant}
      >
        {isUploading ? <Spinner /> : <UploadSimpleIcon />}
        {label(children, { isUploading, multiple, progress })}
      </Button>

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

      {!hideStatus && (
        <div className="w-full">
          <UploadStatusList layout="strip" uploads={surface.uploads} />
        </div>
      )}
    </div>
  );
}

function label(
  children: ReactNode,
  state: { isUploading: boolean; multiple: boolean; progress: number }
): ReactNode {
  if (children !== undefined) {
    return children;
  }
  if (state.isUploading) {
    return `Uploading ${Math.floor(state.progress * 100)}%`;
  }
  return state.multiple ? "Choose files" : "Choose file";
}
