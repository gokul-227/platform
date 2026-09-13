import type { FileResponse } from "./file.schemas";

/**
 * Client-side state of one file's transfer:
 *
 *   queued -> uploading -> uploaded
 *                |
 *                v
 *              failed
 *
 * `uploaded` and `failed` are terminal. `paused` and `offline` are conditions of
 * `uploading` rather than states of their own: the bytes already in the bucket
 * stay committed either way, so the upload is still live.
 *
 * Distinct from the row's own `status` (`pending` / `ready`) and from the upload
 * session's (`pending` / `completing`): this describes the transfer, which only
 * the client can see. It lives here so a consumer narrows over one vocabulary,
 * and it deliberately avoids the word `pending`, which those two already use for
 * something else.
 */

export interface UploadFileFacts {
  contentType: string;
  name: string;
  totalBytes: number;
}

export interface QueuedUpload extends UploadFileFacts {
  status: "queued";
}

export interface UploadingUpload extends UploadFileFacts {
  fileId: string;
  /** Connection is down; the client continues on its own once it is back. */
  offline: boolean;
  paused: boolean;
  /** 0..1, monotonic — never walks backwards after a chunk is re-sent. */
  progress: number;
  sentBytes: number;
  status: "uploading";
}

export interface UploadedUpload extends UploadFileFacts {
  file: FileResponse;
  fileId: string;
  status: "uploaded";
}

export interface FailedUpload extends UploadFileFacts {
  /**
   * `description` is the platform error's own sentence, written for whoever hit
   * it ("a file with this name already exists in the same folder"), and is what
   * a surface should show. `message` is the short name of the failure, and
   * `code` is for branching, never for reading.
   */
  error: { code: string; description?: string; message: string };
  /** Null when the failure happened before the file row existed. */
  fileId: string | null;
  /** True when the bytes already in the bucket can still be continued. */
  resumable: boolean;
  status: "failed";
}

export type FileUploadState =
  | QueuedUpload
  | UploadingUpload
  | UploadedUpload
  | FailedUpload;

export function isUploadingState(
  state: FileUploadState
): state is UploadingUpload {
  return state.status === "uploading";
}

export function isUploadedState(
  state: FileUploadState
): state is UploadedUpload {
  return state.status === "uploaded";
}

export function isFailedState(state: FileUploadState): state is FailedUpload {
  return state.status === "failed";
}

export function isTerminalState(
  state: FileUploadState
): state is UploadedUpload | FailedUpload {
  return state.status === "uploaded" || state.status === "failed";
}
