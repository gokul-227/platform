/**
 * Client upload engine. One task per file, fully isolated: pausing, aborting or
 * losing one upload never touches the others.
 *
 * Ticket shapes, one per way a backend accepts a large file:
 * - `put`: one request, all the bytes. There is no resume point, so pause is a
 *   no-op and a failure means starting over.
 * - `resumable`: chunks of the size the server advertised. The bucket owns the
 *   committed prefix, so pause aborts the chunk in flight and resume asks the
 *   bucket where it got to (`bytes *​/total` -> 308 + `Range`) and continues.
 * - `multipart`: independent parts to presigned URLs. The ticket lists only the
 *   parts still missing, so a resumed upload skips what already landed; pause
 *   waits out the part in flight rather than discarding it.
 *
 * Either interruptible shape survives a page reload the same way: re-fetch the
 * session and let the bucket say what it already has.
 */

import type {
  CompleteFileInput,
  CreateFileInput,
  CreateFileResponse,
  FileResponse,
  FileScope,
  FileUploadState,
  UploadSessionResponse,
  UploadTicket,
} from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import {
  httpPut,
  isAbortError,
  NetworkError,
  network,
  type PutResponse,
} from "./transport";
import { UploadErrors } from "./upload.errors";

/** Retries against a reachable-but-failing bucket, before giving up. */
const MAX_RETRIES = 4;
const BACKOFF_BASE_MS = 500;

/** The API calls the engine makes; `FileClient` satisfies it. */
export interface UploadApi {
  abortUpload(fileId: string): Promise<void>;
  complete(fileId: string, input?: CompleteFileInput): Promise<FileResponse>;
  create(scope: FileScope, input: CreateFileInput): Promise<CreateFileResponse>;
  uploadSession(fileId: string): Promise<UploadSessionResponse>;
}

export interface UploadEvents {
  onProgress?: (info: {
    progress: number;
    sentBytes: number;
    totalBytes: number;
  }) => void;
  onStateChange?: (state: FileUploadState) => void;
}

/** A live upload: watch it, pause it, give up on it. */
export interface FileUpload {
  /** Abandon the upload and drop the pending row server-side. */
  abort: () => Promise<void>;
  /** The `ready` file, or a rejection carrying why it failed. */
  done: Promise<FileResponse>;
  getState: () => FileUploadState;
  /** No-op for a single-request upload; there would be nothing to resume into. */
  pause: () => void;
  resume: () => void;
}

export interface UploadMeta {
  checksum?: string;
  /**
   * MIME type to declare. `application/octet-stream` is how "the browser could
   * not name it" is said on the wire: the server reads the extension from there,
   * which is where that guess belongs, since presets validate the declared type
   * against their allowlist. Never the empty string, which declares a type of no
   * length and is refused.
   */
  contentType: string;
  /** Your own id for this file. Makes a retried upload resume rather than duplicate. */
  externalId?: string;
  name: string;
  parentId?: string | null;
  /** Named upload configuration to check against. Omit for `default`. */
  preset?: string;
  /** Internal asset hidden from the browseable tree (e.g. a render artifact). */
  system?: boolean;
}

/** Blocks the transfer loop while paused, without dropping committed bytes. */
class Gate {
  private open = true;
  private waiters: (() => void)[] = [];

  close(): void {
    this.open = false;
  }

  release(): void {
    this.open = true;
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }

  wait(): Promise<void> {
    if (this.open) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Byte length of one multipart part, the last one short. */
function partSpan(
  partNumber: number,
  partSizeBytes: number,
  totalBytes: number
): number {
  const start = (partNumber - 1) * partSizeBytes;
  return Math.max(0, Math.min(start + partSizeBytes, totalBytes) - start);
}

/** `bytes=0-N` -> N + 1 committed bytes; a session with nothing stored omits it. */
function committedFromRange(header: string | null): number {
  if (!header) {
    return 0;
  }
  const end = Number(header.split("-")[1]);
  return Number.isFinite(end) ? end + 1 : 0;
}

/**
 * Classify a storage response. Transient statuses are worth a backoff; a
 * deterministic 4xx is fatal now — retrying one forever is what makes an upload
 * look frozen instead of failed.
 */
function errorForStatus(status: number, context: string): Error {
  if (status === 408 || status === 429 || status >= 500) {
    return new NetworkError(`storage answered ${status} on ${context}`);
  }
  if (status === 413) {
    return new PlatformError(
      UploadErrors.STORAGE_REJECTED,
      `Storage rejected the ${context}: the body exceeds the provider's own size limit`,
      { statusCode: status }
    );
  }
  if (status === 401 || status === 403) {
    return new PlatformError(
      UploadErrors.STORAGE_REJECTED,
      `Storage denied the ${context} (${status}); the upload capability may have expired`,
      { statusCode: status }
    );
  }
  return new PlatformError(
    UploadErrors.STORAGE_REJECTED,
    `Storage rejected the ${context} (HTTP ${status})`,
    { statusCode: status }
  );
}

function toFailure(error: unknown): {
  code: string;
  description?: string;
  message: string;
} {
  if (error instanceof PlatformError) {
    // The description is the half a reader needs: `message` defaults to the
    // failure's short name, so a conflict said "Name already exists" and never
    // which name, where, or that anything could be done about it.
    return {
      code: error.code,
      message: error.message,
      description: error.description,
    };
  }
  if (error instanceof NetworkError) {
    return {
      code: UploadErrors.NETWORK_FAILED.code,
      message: error.message,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: UploadErrors.NETWORK_FAILED.code, message };
}

class UploadTask {
  private readonly gate = new Gate();
  private controller: AbortController | null = null;
  private aborted = false;
  /** Bytes the bucket has confirmed (chunks acked). */
  private committedBytes = 0;
  /** Monotonic floor so a re-sent chunk cannot walk progress backwards. */
  private reportedBytes = 0;
  private retryCount = 0;
  /** Set once the row exists, so recovery can ask the server about it. */
  private fileId: string | null = null;
  /** Set when the server confirmed the upload while recovery was in progress. */
  private completed: FileResponse | null = null;
  /** Set once the ticket is in hand; pause behaves differently per shape. */
  private strategy: UploadTicket["type"] | null = null;
  private state: FileUploadState;

  constructor(
    private readonly body: Blob,
    private readonly meta: UploadMeta,
    private readonly api: UploadApi,
    private readonly events: UploadEvents
  ) {
    this.state = {
      status: "queued",
      name: meta.name,
      contentType: meta.contentType,
      totalBytes: body.size,
    };
  }

  getState(): FileUploadState {
    return this.state;
  }

  /** Create the row, send the bytes, confirm. */
  async start(scope: FileScope): Promise<FileResponse> {
    return await this.run(async () => {
      const created = await this.api.create(scope, {
        type: "file",
        name: this.meta.name,
        contentType: this.meta.contentType,
        size: this.body.size,
        ...(this.meta.parentId === undefined
          ? {}
          : { parentId: this.meta.parentId }),
        ...(this.meta.checksum === undefined
          ? {}
          : { checksum: this.meta.checksum }),
        ...(this.meta.externalId === undefined
          ? {}
          : { externalId: this.meta.externalId }),
        ...(this.meta.preset === undefined ? {} : { preset: this.meta.preset }),
        ...(this.meta.system === undefined ? {} : { system: this.meta.system }),
      });
      if (!created.upload) {
        throw new PlatformError(
          UploadErrors.STORAGE_REJECTED,
          "the server created the file without an upload ticket"
        );
      }
      return {
        fileId: created.file.id,
        ticket: created.upload,
        isResume: false,
      };
    });
  }

  /** Pick an unfinished upload back up, wherever the bucket left off. */
  async resumeFrom(fileId: string): Promise<FileResponse> {
    return await this.run(async () => {
      const session = await this.api.uploadSession(fileId);
      return { fileId, ticket: session.upload, isResume: true };
    });
  }

  pause(): void {
    if (this.state.status !== "uploading" || this.state.paused) {
      return;
    }
    this.gate.close();
    this.setState({ ...this.state, paused: true });
    if (this.strategy === "resumable") {
      // Drop the chunk in flight: the bucket keeps everything it already
      // committed, and resuming re-reads that offset anyway. Multipart pauses
      // between parts instead — see sendParts.
      this.controller?.abort();
    }
  }

  resume(): void {
    if (this.state.status !== "uploading") {
      return;
    }
    if (this.state.paused) {
      this.setState({ ...this.state, paused: false });
    }
    this.gate.release();
  }

  async abort(): Promise<void> {
    if (this.aborted || this.state.status === "uploaded") {
      return;
    }
    this.aborted = true;
    this.controller?.abort();
    // Let a paused loop notice the abort.
    this.gate.release();
    const fileId = this.fileIdOf(this.state);
    if (fileId) {
      await this.api.abortUpload(fileId).catch(() => {
        // The row outlives a failed abort; the server's sweeper takes it.
      });
    }
    this.fail(new PlatformError(UploadErrors.ABORTED), false);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async run(
    open: () => Promise<{
      fileId: string;
      isResume: boolean;
      ticket: UploadTicket;
    }>
  ): Promise<FileResponse> {
    let fileId: string | null = null;
    try {
      const opened = await open();
      fileId = opened.fileId;
      this.fileId = fileId;
      this.strategy = opened.ticket.type;
      this.setState({
        status: "uploading",
        name: this.meta.name,
        contentType: this.meta.contentType,
        totalBytes: this.body.size,
        fileId,
        sentBytes: this.committedBytes,
        progress: this.fractionOf(this.committedBytes),
        paused: false,
        offline: false,
      });

      try {
        switch (opened.ticket.type) {
          case "resumable":
            await this.sendChunks(
              opened.ticket.sessionUrl,
              opened.ticket.chunkSizeBytes,
              opened.isResume
            );
            break;
          case "multipart":
            await this.sendParts(opened.ticket);
            break;
          default:
            await this.sendWhole(opened.ticket);
        }
      } catch (transferError) {
        // The client's view of the transport can be wrong. A response it could
        // not read is not evidence the bytes are missing, and giving up here
        // would fail an upload the bucket already holds in full. `complete`
        // verifies against the bucket, so ask it once before believing the
        // failure.
        this.assertLive();
        const salvaged = await this.api
          .complete(fileId, this.completeInput())
          .catch(() => null);
        if (!salvaged) {
          throw transferError;
        }
        return this.finish(salvaged);
      }

      // Recovery may have confirmed it already; completing twice would be
      // rejected as no-longer-pending.
      if (this.completed) {
        return this.finish(this.completed);
      }

      // Hold a pause that landed with the last bytes: confirming here would end
      // the upload the caller just asked to suspend.
      this.assertLive();
      await this.gate.wait();
      this.assertLive();

      return this.finish(
        await this.withNetworkRetries(() =>
          this.api.complete(fileId as string, this.completeInput())
        )
      );
    } catch (err) {
      // The server confirmed it while recovery was unwinding: that is a success
      // whatever the transport reported on the way out.
      if (this.completed) {
        return this.finish(this.completed);
      }
      // Committed bytes survive a failure, so the caller can resume rather than
      // start over — but only where there is a session holding them.
      this.fail(err, this.committedBytes > 0, fileId);
      throw err;
    }
  }

  private completeInput(): CompleteFileInput {
    return {
      size: this.body.size,
      ...(this.meta.checksum ? { checksum: this.meta.checksum } : {}),
    };
  }

  private finish(file: FileResponse): FileResponse {
    this.setState({
      status: "uploaded",
      name: this.meta.name,
      contentType: this.meta.contentType,
      totalBytes: this.body.size,
      fileId: file.id,
      file,
    });
    return file;
  }

  private async sendWhole(
    ticket: Extract<UploadTicket, { type: "put" }>
  ): Promise<void> {
    for (;;) {
      this.assertLive();
      try {
        this.controller = new AbortController();
        const res = await httpPut({
          url: ticket.url,
          body: this.body,
          headers: ticket.headers,
          onProgress: (sent) => this.reportProgress(sent),
          signal: this.controller.signal,
        });
        if (res.status >= 400) {
          throw errorForStatus(res.status, "upload");
        }
        this.retryCount = 0;
        this.reportProgress(this.body.size);
        return;
      } catch (err) {
        if (isAbortError(err)) {
          this.assertLive();
          continue;
        }
        if (err instanceof NetworkError) {
          if (await this.recoverNetwork(err)) {
            return;
          }
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Multipart: each part is an independent PUT, so the ticket lists exactly what
   * is missing and anything already in the bucket counts as progress from the
   * start. Pausing is soft here — the part in flight is allowed to finish and
   * the next one simply does not start. Dropping it would waste the bytes
   * already on the wire, and some services count a superseded part against the
   * upload's own limits.
   */
  private async sendParts(
    ticket: Extract<UploadTicket, { type: "multipart" }>
  ): Promise<void> {
    const total = this.body.size;
    const outstanding = ticket.parts.reduce(
      (sum, part) =>
        sum + partSpan(part.partNumber, ticket.partSizeBytes, total),
      0
    );
    this.committedBytes = total - outstanding;
    this.reportProgress(this.committedBytes);

    for (const part of ticket.parts) {
      const start = (part.partNumber - 1) * ticket.partSizeBytes;
      const end = Math.min(start + ticket.partSizeBytes, total);
      const sentBefore = this.committedBytes;

      for (;;) {
        this.assertLive();
        await this.gate.wait();
        this.assertLive();
        try {
          this.controller = new AbortController();
          const res = await httpPut({
            url: part.url,
            body: this.body.slice(start, end),
            onProgress: (sent) => this.reportProgress(sentBefore + sent),
            signal: this.controller.signal,
          });
          if (res.status >= 400) {
            throw errorForStatus(res.status, "part upload");
          }
          this.committedBytes = sentBefore + (end - start);
          this.retryCount = 0;
          this.reportProgress(this.committedBytes);
          break;
        } catch (err) {
          if (isAbortError(err)) {
            // Aborted, not paused: pause leaves the request alone.
            this.assertLive();
            continue;
          }
          if (err instanceof NetworkError) {
            if (await this.recoverNetwork(err)) {
              return;
            }
            continue;
          }
          throw err;
        }
      }
    }
  }

  private async sendChunks(
    sessionUrl: string,
    chunkSizeBytes: number,
    isResume: boolean
  ): Promise<void> {
    const total = this.body.size;
    if (isResume) {
      // The session may already hold bytes; ask before re-sending any. A session
      // just created holds none, so a new upload skips the round-trip.
      this.committedBytes = await this.withNetworkRetries(() =>
        this.probeOffset(sessionUrl, total)
      );
      this.reportProgress(this.committedBytes);
    }

    while (this.committedBytes < total) {
      this.assertLive();
      await this.gate.wait();
      this.assertLive();

      const start = this.committedBytes;
      const end = Math.min(start + chunkSizeBytes, total);
      try {
        this.controller = new AbortController();
        const res = await httpPut({
          url: sessionUrl,
          body: this.body.slice(start, end),
          headers: { "Content-Range": `bytes ${start}-${end - 1}/${total}` },
          onProgress: (sent) => this.reportProgress(start + sent),
          signal: this.controller.signal,
        });
        this.commitChunk(res, start, total);
        this.retryCount = 0;
      } catch (err) {
        if (isAbortError(err)) {
          // Paused, or aborted — the loop head re-checks. Either way the bucket
          // is the group on how much of that chunk survived.
          await this.gate.wait();
          this.assertLive();
          this.committedBytes = await this.withNetworkRetries(() =>
            this.probeOffset(sessionUrl, total)
          );
          this.reportProgress(this.committedBytes);
          continue;
        }
        if (err instanceof NetworkError) {
          if (await this.recoverNetwork(err)) {
            return;
          }
          // Re-read the offset rather than assuming the chunk was lost: the
          // bucket may well have stored it and only the response went missing.
          // A failing probe counts against the same budget instead of being
          // swallowed, which would re-send a chunk that already landed.
          this.committedBytes = await this.withNetworkRetries(() =>
            this.probeOffset(sessionUrl, total)
          );
          this.reportProgress(this.committedBytes);
          continue;
        }
        throw err;
      }
    }
  }

  private commitChunk(res: PutResponse, start: number, total: number): void {
    if (res.status === 200 || res.status === 201) {
      this.committedBytes = total;
      this.reportProgress(total);
      return;
    }
    if (res.status !== 308) {
      throw errorForStatus(res.status, "chunk");
    }

    const range = res.getHeader("range");
    if (range === null) {
      // The offset is the only thing that moves this loop forward, and a 308
      // that stored bytes always carries it — so an absent header means it is
      // there but unreadable, which retrying cannot fix.
      throw new PlatformError(
        UploadErrors.STORAGE_REJECTED,
        "storage accepted the chunk without a readable `Range` header; the bucket's CORS config has to expose it"
      );
    }
    const committed = committedFromRange(range);
    if (committed <= start) {
      // Nothing of that chunk survived. Treat as transient so it retries under
      // the normal budget instead of spinning.
      throw new NetworkError(
        `storage did not advance past ${start} bytes on the last chunk`
      );
    }
    this.committedBytes = committed;
    this.reportProgress(committed);
  }

  /** Ask the bucket how much of the file it has: `bytes *​/total` -> 308 + Range. */
  private async probeOffset(
    sessionUrl: string,
    total: number
  ): Promise<number> {
    const res = await httpPut({
      url: sessionUrl,
      body: new Blob([]),
      headers: { "Content-Range": `bytes */${total}` },
    });
    if (res.status === 308) {
      return committedFromRange(res.getHeader("range"));
    }
    if (res.status === 200 || res.status === 201) {
      return total;
    }
    throw errorForStatus(res.status, "offset probe");
  }

  /**
   * A real outage parks the task and waits for the connection without spending
   * retry budget; a reachable-but-failing bucket gets bounded backoff instead.
   */
  private async recoverNetwork(cause?: unknown): Promise<boolean> {
    if (network.isOffline()) {
      this.setOffline(true);
      await network.waitForOnline();
      this.assertLive();
      this.setOffline(false);
      return false;
    }

    // Every byte is already on the wire, so another attempt sends nothing new.
    // Ask the server instead of spending the backoff on it: if the bucket has
    // the file, the upload is finished and the failure was only the response.
    if (this.reportedBytes >= this.body.size && this.fileId) {
      const settled = await this.api
        .complete(this.fileId, this.completeInput())
        .catch(() => null);
      if (settled) {
        this.completed = settled;
        return true;
      }
    }

    this.retryCount += 1;
    if (this.retryCount > MAX_RETRIES) {
      // Carry the last failure: without it a report says only "gave up", and
      // the cause (an unreadable response, a 503, a blocked probe) is lost.
      const because =
        cause instanceof Error ? `; last failure: ${cause.message}` : "";
      throw new PlatformError(
        UploadErrors.RETRIES_EXHAUSTED,
        `Upload failed after ${MAX_RETRIES} retries${because}`,
        { cause }
      );
    }
    await sleep(BACKOFF_BASE_MS * 2 ** (this.retryCount - 1));
    // retryCount resets only on real byte progress, never here: a deterministic
    // failure must not retry forever.
    return false;
  }

  /** A control-plane call with the same offline/backoff resilience. */
  private async withNetworkRetries<T>(fn: () => Promise<T>): Promise<T> {
    for (;;) {
      this.assertLive();
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof NetworkError)) {
          throw err;
        }
        // A settle here means the server confirmed the upload mid-recovery. This
        // signature cannot carry that, so let the error unwind: `run` checks
        // `completed` before treating anything as a failure.
        if (await this.recoverNetwork(err)) {
          throw err;
        }
      }
    }
  }

  private assertLive(): void {
    if (this.aborted) {
      throw new PlatformError(UploadErrors.ABORTED);
    }
  }

  private fractionOf(sentBytes: number): number {
    return this.body.size === 0 ? 1 : sentBytes / this.body.size;
  }

  private fileIdOf(state: FileUploadState): string | null {
    return state.status === "queued" ? null : state.fileId;
  }

  private setState(next: FileUploadState): void {
    this.state = next;
    this.events.onStateChange?.(next);
  }

  private setOffline(offline: boolean): void {
    if (this.state.status === "uploading") {
      this.setState({ ...this.state, offline });
    }
  }

  private reportProgress(sentBytes: number): void {
    if (this.state.status !== "uploading") {
      return;
    }
    const monotonic = Math.max(
      this.reportedBytes,
      Math.min(sentBytes, this.body.size)
    );
    this.reportedBytes = monotonic;
    const progress = this.fractionOf(monotonic);
    this.setState({ ...this.state, sentBytes: monotonic, progress });
    this.events.onProgress?.({
      progress,
      sentBytes: monotonic,
      totalBytes: this.body.size,
    });
  }

  private fail(
    error: unknown,
    resumable: boolean,
    fileId?: string | null
  ): void {
    if (this.state.status === "uploaded" || this.state.status === "failed") {
      return;
    }
    this.setState({
      status: "failed",
      name: this.meta.name,
      contentType: this.meta.contentType,
      totalBytes: this.body.size,
      fileId: fileId ?? this.fileIdOf(this.state),
      error: toFailure(error),
      resumable,
    });
  }
}

function controlsFor(
  task: UploadTask,
  done: Promise<FileResponse>
): FileUpload {
  return {
    done,
    pause: () => task.pause(),
    resume: () => task.resume(),
    abort: () => task.abort(),
    getState: () => task.getState(),
  };
}

/** Start an upload: create the row, send the bytes, confirm. */
export function startFileUpload(args: {
  api: UploadApi;
  body: Blob;
  events?: UploadEvents;
  meta: UploadMeta;
  scope: FileScope;
}): FileUpload {
  const task = new UploadTask(
    args.body,
    args.meta,
    args.api,
    args.events ?? {}
  );
  return controlsFor(task, task.start(args.scope));
}

/**
 * Continue an upload that was paused, interrupted, or started in another page
 * load. The same bytes must be supplied again — the browser cannot keep a `File`
 * across a reload — and the bucket decides which of them still need sending.
 */
export function resumeFileUpload(args: {
  api: UploadApi;
  body: Blob;
  events?: UploadEvents;
  fileId: string;
  meta: UploadMeta;
}): FileUpload {
  const task = new UploadTask(
    args.body,
    args.meta,
    args.api,
    args.events ?? {}
  );
  return controlsFor(task, task.resumeFrom(args.fileId));
}
