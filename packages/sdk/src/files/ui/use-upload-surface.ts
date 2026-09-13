"use client";

import type {
  FailedUpload,
  FileResponse,
  FileScope,
} from "@aec-craft/platform-contracts";
import { useCallback, useRef, useState } from "react";
import {
  type FileUploadsResult,
  useFilePresets,
  useFileUploads,
} from "../react/file.hooks";

import { formatBytes } from "./upload-attachment";

/**
 * What `<UploadDropzone>` and `<UploadButton>` share: the hidden file input, the
 * policy check that happens before any bytes move, and the batch itself. The two
 * components differ only in what the user clicks.
 */

export interface UploadSurfaceOptions {
  multiple: boolean;
  onError?: (state: FailedUpload) => void;
  onUploaded?: (file: FileResponse) => void;
  parentId?: string | null;
  /** Named upload configuration to validate against. Defaults to `default`. */
  preset?: string;
  scope: FileScope;
}

export interface UploadSurface {
  /** The deployment has no storage backend: byte operations would 503. */
  isUnavailable: boolean;
  /** Per-file ceiling, once the presets have loaded. */
  maxBytes: number | undefined;
  /** Open the file picker. */
  openPicker: () => void;
  pickerRef: React.RefObject<HTMLInputElement | null>;
  /** Why the last selection was turned away, if it was. */
  rejected: string | null;
  /** Hand files to the batch, policy permitting. */
  submit: (files: File[]) => void;
  uploads: FileUploadsResult;
}

export function useUploadSurface(options: UploadSurfaceOptions): UploadSurface {
  const { scope, parentId, multiple, onUploaded, onError } = options;
  const pickerRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const presets = useFilePresets();
  const uploads = useFileUploads({
    ...(parentId === undefined ? {} : { parentId }),
    ...(options.preset === undefined ? {} : { preset: options.preset }),
    ...(onUploaded ? { onUploaded } : {}),
    ...(onError ? { onError } : {}),
  });

  const preset = presets.data?.presets.find(
    (candidate) => candidate.name === (options.preset ?? "default")
  );
  const maxBytes = preset?.maxFileSizeBytes;

  const submit = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      // Check the published preset here rather than letting the server reject it
      // after the user has already waited on a transfer.
      const tooBig = maxBytes
        ? files.find((file) => file.size > maxBytes)
        : undefined;
      if (tooBig && maxBytes) {
        setRejected(
          `${tooBig.name} is ${formatBytes(tooBig.size)}; the limit is ${formatBytes(maxBytes)}`
        );
        return;
      }
      setRejected(null);
      uploads.start(scope, multiple ? files : files.slice(0, 1));
    },
    [maxBytes, multiple, scope, uploads]
  );

  const openPicker = useCallback(() => pickerRef.current?.click(), []);

  return {
    uploads,
    submit,
    openPicker,
    pickerRef,
    rejected,
    maxBytes,
    isUnavailable: presets.data?.storageAvailable === false,
  };
}
