"use client";

import type { FileUploadState } from "@aec-craft/platform-contracts";
import { Spinner } from "@aec-craft/ui/components/custom/spinner";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@aec-craft/ui/components/primitives/attachment";
import {
  ArrowClockwiseIcon,
  CheckIcon,
  WarningIcon,
  WifiSlashIcon,
  XIcon,
} from "@aec-craft/ui/icons";
import { cn } from "@aec-craft/ui/lib/utils";

export interface UploadAttachmentProps {
  className?: string;
  /** Give up on an upload still in flight. */
  onAbort?: () => void;
  /** Take a settled row off the list. There is nothing to abort by then. */
  onDismiss?: () => void;
  onRetry?: () => void;
  state: FileUploadState;
}

/**
 * One upload, as an attachment row: what it is called, how far it has got, and
 * the two things that can be done about it.
 *
 * The progress is a percentage in the description rather than a bar, and the
 * spinner sits where the icon would be, so a row stays one line high whatever it
 * is doing and a list of them reads as a list rather than as a stack of meters.
 *
 * No pause or resume control. Both stay on `useFileUploads` for a surface that
 * wants them, but on a row already moving they are two more buttons where the
 * questions are only "is it done" and "make it stop".
 */
export function UploadAttachment({
  state,
  onAbort,
  onDismiss,
  onRetry,
  className,
}: UploadAttachmentProps): React.ReactElement {
  const isSettled = state.status === "uploaded" || state.status === "failed";
  const isOffline = state.status === "uploading" && state.offline;

  return (
    <Attachment
      className={cn("w-full", className)}
      size="sm"
      state={attachmentState(state)}
    >
      <AttachmentMedia>
        <StatusIcon isOffline={isOffline} state={state} />
      </AttachmentMedia>

      <AttachmentContent>
        <AttachmentTitle>{state.name}</AttachmentTitle>
        <AttachmentDescription>
          {describe(state, isOffline)}
        </AttachmentDescription>
      </AttachmentContent>

      <AttachmentActions>
        {state.status === "failed" && (
          <IconAction label="Retry upload" onClick={onRetry}>
            <ArrowClockwiseIcon />
          </IconAction>
        )}
        {/* Last, and the only one on a row that is behaving: it stops what is
            moving and clears what has settled, which is one gesture. */}
        <IconAction
          label={isSettled ? "Dismiss" : "Cancel upload"}
          onClick={isSettled ? onDismiss : onAbort}
        >
          <XIcon />
        </IconAction>
      </AttachmentActions>
    </Attachment>
  );
}

/** The primitive's vocabulary; offline stays a condition of uploading. */
function attachmentState(
  state: FileUploadState
): "idle" | "uploading" | "error" | "done" {
  switch (state.status) {
    case "queued":
      return "idle";
    case "uploading":
      return "uploading";
    case "uploaded":
      return "done";
    default:
      return "error";
  }
}

function IconAction({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}): React.ReactElement | null {
  if (!onClick) {
    return null;
  }
  return (
    <AttachmentAction aria-label={label} onClick={onClick}>
      {children}
    </AttachmentAction>
  );
}

/** Spinning while it moves, a tick when it lands, a warning when it does not. */
function StatusIcon({
  state,
  isOffline,
}: {
  isOffline: boolean;
  state: FileUploadState;
}): React.ReactElement {
  if (state.status === "uploaded") {
    return <CheckIcon />;
  }
  if (state.status === "failed") {
    return <WarningIcon />;
  }
  if (isOffline) {
    return <WifiSlashIcon />;
  }
  return <Spinner className="size-4" />;
}

function describe(state: FileUploadState, isOffline: boolean): string {
  const total = formatBytes(state.totalBytes);
  switch (state.status) {
    case "queued":
      return `${total} · waiting`;
    case "uploading": {
      const percent = `${Math.floor(state.progress * 100)}%`;
      return isOffline
        ? `${percent} of ${total} · offline, will continue`
        : `${percent} of ${total}`;
    }
    case "uploaded":
      return total;
    case "failed": {
      const reason = state.error.description ?? state.error.message;
      return state.resumable
        ? `${reason} · can continue where it stopped`
        : reason;
    }
    default:
      return total;
  }
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${BYTE_UNITS[exponent]}`;
}
