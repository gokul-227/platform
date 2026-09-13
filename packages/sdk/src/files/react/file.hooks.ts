"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { platformKeys } from "../../common/react/keys";
import { usePlatformClient } from "../../common/react/provider";
import type {
  CompleteFileInput,
  CreateFileInput,
  FailedUpload,
  FileResponse,
  FileScope,
  FileUpload,
  FileUploadState,
  ProjectFileListInput,
  UpdateFileInput,
} from "../../index";

/** Rows per page of a tree level. The endpoint caps a page at 200. */
const LEVEL_PAGE_SIZE = 100;

/**
 * Files and folders. List/create take `FileScope` (scope is intrinsic);
 * by-id ops take the id and the server resolves scope from the row. Browse a
 * folder by passing its id as `{ parentId }`; omit it for the scope root.
 *
 * `system` is coerced server-side from any present value, so leave it out
 * rather than passing `false` — that reads as true and lists internal assets.
 */
export function useFiles(
  scope: FileScope | null | undefined,
  query?: Omit<ProjectFileListInput, "orgId" | "projectId">
) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: scope
      ? ([...platformKeys.files.list(scope), query ?? null] as const)
      : (["platform", "files", "disabled"] as const),
    queryFn: () => client.files.list(scope!, query),
    enabled: !!scope,
  });
}

/**
 * One level of the tree, page by page: the children of `parentId` (the scope
 * root when it is omitted), growing as `fetchNextPage` is called.
 *
 * Offset pages rather than the cursor, because `?sort` is offset-only and a
 * level wants its own order (`sort: ["type:desc", "name:asc"]` puts folders
 * first, each block alphabetical). `total` comes back with every page, so
 * "is there more" is `loaded < total` and needs no probe request.
 *
 *   const level = useFileLevel(scope, { parentId, sort: FOLDERS_FIRST });
 *   const rows = level.data?.pages.flatMap((page) => page.items) ?? [];
 */
export function useFileLevel(
  scope: FileScope | null | undefined,
  query?: Omit<ProjectFileListInput, "cursor" | "limit" | "page">
) {
  const client = usePlatformClient();
  const pageSize = query?.pageSize ?? LEVEL_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: scope
      ? ([...platformKeys.files.list(scope), "level", query ?? null] as const)
      : (["platform", "files", "disabled"] as const),
    queryFn: ({ pageParam }) =>
      client.files.list(scope!, { ...query, page: pageParam, pageSize }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < (last.total ?? 0) ? pages.length + 1 : undefined;
    },
    enabled: !!scope,
  });
}

export function useFile(fileId: string | null | undefined) {
  const client = usePlatformClient();
  return useQuery({
    queryKey: fileId
      ? platformKeys.files.detail(fileId)
      : (["platform", "files", "disabled"] as const),
    queryFn: () => client.files.findById(fileId!),
    enabled: !!fileId,
  });
}

export function useCreateFolder() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      input,
    }: {
      scope: FileScope;
      input: { name: string; parentId?: string | null };
    }) => client.files.createFolder(scope, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: platformKeys.files.list(vars.scope),
      });
    },
  });
}

export function useUpdateFile() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fileId,
      input,
    }: {
      fileId: string;
      input: UpdateFileInput;
    }) => client.files.update(fileId, input),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: platformKeys.files.lists() });
      void qc.invalidateQueries({
        queryKey: platformKeys.files.detail(data.id),
      });
    },
  });
}

export function useDeleteFile() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId }: { fileId: string }) => client.files.delete(fileId),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: platformKeys.files.lists() });
      void qc.invalidateQueries({
        queryKey: platformKeys.files.detail(vars.fileId),
      });
    },
  });
}

/** Get a fresh signed download URL on demand (not cached; URLs are short-lived). */
export function useDownloadFile() {
  const client = usePlatformClient();
  return useMutation({
    mutationFn: ({ fileId }: { fileId: string }) =>
      client.files.download(fileId),
  });
}

/** Low-level create/complete for a custom upload flow. */
export function useCreateFile() {
  const client = usePlatformClient();
  return useMutation({
    mutationFn: ({
      scope,
      input,
    }: {
      scope: FileScope;
      input: CreateFileInput;
    }) => client.files.create(scope, input),
  });
}

export function useCompleteFile() {
  const client = usePlatformClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fileId,
      input,
    }: {
      fileId: string;
      input?: CompleteFileInput;
    }) => client.files.complete(fileId, input),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: platformKeys.files.lists() });
      void qc.invalidateQueries({
        queryKey: platformKeys.files.detail(data.id),
      });
    },
  });
}

/** What the deployment accepts on upload. Deployment config, so cached for the session. */
export function useFilePresets() {
  const client = usePlatformClient();
  return useQuery({
    queryKey: platformKeys.files.presets(),
    queryFn: () => client.files.presets(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export interface UploadState {
  error: Error | null;
  isUploading: boolean;
  progress: number;
  upload: (
    scope: FileScope,
    body: Blob,
    meta: { name: string; contentType?: string; parentId?: string | null }
  ) => Promise<FileResponse>;
}

/**
 * One-call background upload: create -> bytes -> confirm, a 0..1 `progress`, and
 * the folder listing invalidated on success. Large files still go up in chunks,
 * but this hook keeps no controls — reach for `useFileUploads` when the UI needs
 * to pause, resume, or show per-file state.
 *
 *   const { upload, progress, isUploading } = useUploadFile();
 *   await upload(scope, file, { parentId });   // `file` is a browser File/Blob
 */
export function useUploadFile(): UploadState {
  const client = usePlatformClient();
  const qc = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const upload = useCallback(
    async (
      scope: FileScope,
      body: Blob,
      meta: { name: string; contentType?: string; parentId?: string | null }
    ): Promise<FileResponse> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);
      try {
        const result = await client.files.uploadFile(
          scope,
          body,
          {
            name: meta.name,
            contentType: meta.contentType ?? body.type,
            ...(meta.parentId === undefined ? {} : { parentId: meta.parentId }),
          },
          { onProgress: setProgress }
        );
        void qc.invalidateQueries({ queryKey: platformKeys.files.list(scope) });
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsUploading(false);
      }
    },
    [client, qc]
  );

  return { upload, progress, isUploading, error };
}

/** One tracked upload: its live state plus the controls for that file alone. */
export interface FileUploadItem {
  abort: () => Promise<void>;
  /** Take this row off the list. Only a finished or failed upload can go. */
  dismiss: () => void;
  /** Stable per-batch key; two selected files can share a name. */
  id: string;
  pause: () => void;
  resume: () => void;
  /** Send the rest again after a failure, from wherever the bucket got to. */
  retry: () => void;
  state: FileUploadState;
}

export interface FileUploadsOptions {
  onError?: (state: FailedUpload) => void;
  onUploaded?: (file: FileResponse) => void;
  parentId?: string | null;
  /**
   * Named upload configuration these files are checked against, client-side
   * before they move and server-side on create. Omit for `default`.
   */
  preset?: string;
  /** Mark uploads as internal assets, hidden from the browse listing. */
  system?: boolean;
}

export interface FileUploadsResult {
  /** Give up on one upload, or on all of them. */
  abort: (id?: string) => Promise<void>;
  /** Forget one finished or failed entry, or every one of them. */
  clear: (id?: string) => void;
  isUploading: boolean;
  items: FileUploadItem[];
  pause: (id?: string) => void;
  /** Bytes-weighted 0..1 across the batch. */
  progress: number;
  resume: (id?: string) => void;
  /** Queue files; each uploads on its own and reports as it goes. */
  start: (scope: FileScope, files: File[]) => void;
}

interface TrackedUpload {
  body: File;
  id: string;
  scope: FileScope;
  state: FileUploadState;
}

/**
 * Batch uploads with full control: per-file state, pause/resume/abort, an
 * offline flag while the connection is down, and retry from the committed
 * offset. Every file is its own upload, so pausing or losing one leaves the
 * others running.
 *
 *   const uploads = useFileUploads({ parentId, onUploaded: () => refetch() });
 *   <input type="file" multiple
 *          onChange={(e) => uploads.start(scope, [...(e.target.files ?? [])])} />
 *   uploads.pause(uploads.items[0].id);
 */
export function useFileUploads(
  options?: FileUploadsOptions
): FileUploadsResult {
  const client = usePlatformClient();
  const qc = useQueryClient();
  const [items, setItems] = useState<TrackedUpload[]>([]);
  const uploads = useRef(new Map<string, FileUpload>());
  const nextId = useRef(0);
  // Read through a ref so a re-created callback prop does not re-run a batch.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const track = useCallback(
    (id: string, scope: FileScope, body: File, resumeFileId: string | null) => {
      const meta = {
        name: body.name,
        contentType: body.type,
        ...(optionsRef.current?.parentId === undefined
          ? {}
          : { parentId: optionsRef.current.parentId }),
        ...(optionsRef.current?.preset === undefined
          ? {}
          : { preset: optionsRef.current.preset }),
        ...(optionsRef.current?.system === undefined
          ? {}
          : { system: optionsRef.current.system }),
      };
      const events = {
        onStateChange: (state: FileUploadState) =>
          setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, state } : item))
          ),
      };
      const upload =
        resumeFileId === null
          ? client.files.upload(scope, body, meta, events)
          : client.files.resumeUpload(resumeFileId, body, meta, events);
      uploads.current.set(id, upload);

      upload.done
        .then((file) => {
          void qc.invalidateQueries({
            queryKey: platformKeys.files.list(scope),
          });
          optionsRef.current?.onUploaded?.(file);
        })
        .catch(() => {
          // The engine published the failure through onStateChange already;
          // read it from there rather than re-deriving it from the rejection.
          const state = upload.getState();
          if (state.status === "failed") {
            optionsRef.current?.onError?.(state);
          }
        });
    },
    [client, qc]
  );

  const start = useCallback(
    (scope: FileScope, files: File[]) => {
      const queued: TrackedUpload[] = files.map((body) => ({
        id: `upload-${nextId.current++}`,
        scope,
        body,
        state: {
          status: "queued",
          name: body.name,
          contentType: body.type,
          totalBytes: body.size,
        },
      }));
      setItems((prev) => [...prev, ...queued]);
      for (const item of queued) {
        track(item.id, scope, item.body, null);
      }
    },
    [track]
  );

  const selected = useCallback((id: string | undefined): FileUpload[] => {
    if (id === undefined) {
      return [...uploads.current.values()];
    }
    const upload = uploads.current.get(id);
    return upload ? [upload] : [];
  }, []);

  const pause = useCallback(
    (id?: string) => {
      for (const upload of selected(id)) {
        upload.pause();
      }
    },
    [selected]
  );

  const resume = useCallback(
    (id?: string) => {
      for (const upload of selected(id)) {
        upload.resume();
      }
    },
    [selected]
  );

  const abort = useCallback(
    async (id?: string) => {
      await Promise.all(selected(id).map((upload) => upload.abort()));
    },
    [selected]
  );

  const retry = useCallback(
    (id: string) => {
      const item = items.find((candidate) => candidate.id === id);
      if (item?.state.status !== "failed") {
        return;
      }
      // A failed upload whose row survived still owns its committed bytes;
      // without one there is nothing to continue, so it starts over.
      const from = item.state.resumable ? item.state.fileId : null;
      track(id, item.scope, item.body, from);
    },
    [items, track]
  );

  const clear = useCallback((id?: string) => {
    setItems((prev) =>
      prev.filter((item) => {
        if (id !== undefined && item.id !== id) {
          return true;
        }
        const terminal =
          item.state.status === "uploaded" || item.state.status === "failed";
        if (terminal) {
          uploads.current.delete(item.id);
        }
        return !terminal;
      })
    );
  }, []);

  const progress = useMemo(() => {
    const total = items.reduce((sum, item) => sum + item.state.totalBytes, 0);
    if (total === 0) {
      return 0;
    }
    const sent = items.reduce((sum, item) => {
      if (item.state.status === "uploaded") {
        return sum + item.state.totalBytes;
      }
      return (
        sum + (item.state.status === "uploading" ? item.state.sentBytes : 0)
      );
    }, 0);
    return sent / total;
  }, [items]);

  const exposed = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        state: item.state,
        pause: () => pause(item.id),
        resume: () => resume(item.id),
        abort: () => abort(item.id),
        retry: () => retry(item.id),
        dismiss: () => clear(item.id),
      })),
    [items, pause, resume, abort, retry, clear]
  );

  return {
    items: exposed,
    start,
    pause,
    resume,
    abort,
    clear,
    progress,
    isUploading: items.some(
      (item) =>
        item.state.status === "queued" || item.state.status === "uploading"
    ),
  };
}
