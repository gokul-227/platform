import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CompleteFileInput,
  CreateFileResponse,
  FileResponse,
  FileUploadState,
  UploadSessionResponse,
  UploadTicket,
} from "../src";
import { network } from "../src/files/upload/transport";
import {
  resumeFileUpload,
  startFileUpload,
  type UploadApi,
} from "../src/files/upload/upload.engine";

import { type FakeBucket, startFakeBucket } from "./helpers/fake-bucket";

/**
 * The engine against a fake bucket that speaks the real resumable protocol.
 * These lock the behaviour the protocol exists for: chunk boundaries, resuming
 * from the committed offset rather than from zero, pausing without losing bytes,
 * and telling a transient failure apart from a fatal one.
 */

const CHUNK = 256 * 1024;
const KEY = "org-1/project-1/file-1";

function fileResponse(id: string, status: "pending" | "ready"): FileResponse {
  return {
    id,
    orgId: "org-1",
    projectId: "project-1",
    parentId: null,
    type: "file",
    name: "model.ifc",
    externalId: null,
    status,
    system: false,
    content: { contentType: "application/x-step", size: 1, checksum: null },
    metadata: {},
    hasChildren: false,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

interface Harness {
  aborts: string[];
  api: UploadApi;
  completes: CompleteFileInput[];
  sessions: number;
}

/**
 * Bytes actually in the fake bucket for the key: a finalized object, or the sum
 * of the multipart parts the server would assemble.
 */
function landedBytes(bucket: FakeBucket): number {
  const object = bucket.objects.get(KEY);
  if (object) {
    return object.byteLength;
  }
  let total = 0;
  for (const part of bucket.parts.get(KEY)?.values() ?? []) {
    total += part.byteLength;
  }
  return total;
}

/**
 * `complete` verifies against the bucket, exactly as the server does, because
 * the engine leans on that: when the transport fails it asks `complete` whether
 * the bytes are there anyway. A stub that always succeeded would hide both the
 * salvage working and a real failure failing.
 */
function harness(ticket: UploadTicket, bucket?: FakeBucket): Harness {
  const state: Harness = {
    aborts: [],
    completes: [],
    sessions: 0,
    api: {} as UploadApi,
  };
  state.api = {
    create: (): Promise<CreateFileResponse> =>
      Promise.resolve({
        file: fileResponse("file-1", "pending"),
        upload: ticket,
      }),
    uploadSession: (fileId: string): Promise<UploadSessionResponse> => {
      state.sessions += 1;
      return Promise.resolve({
        file: fileResponse(fileId, "pending"),
        upload: ticket,
      });
    },
    complete: (fileId: string, input?: CompleteFileInput) => {
      state.completes.push(input ?? {});
      if (bucket && landedBytes(bucket) !== (input?.size ?? 0)) {
        return Promise.reject(
          new Error("no uploaded object found for this key")
        );
      }
      return Promise.resolve(fileResponse(fileId, "ready"));
    },
    abortUpload: (fileId: string) => {
      state.aborts.push(fileId);
      return Promise.resolve();
    },
  };
  return state;
}

function blobOf(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes).fill(7)]);
}

const meta = { name: "model.ifc", contentType: "application/x-step" };

function resumableTicket(bucket: FakeBucket): UploadTicket {
  return {
    type: "resumable",
    sessionUrl: bucket.sessionUrlFor(KEY),
    chunkSizeBytes: CHUNK,
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}

function multipartTicket(
  bucket: FakeBucket,
  partNumbers: number[]
): UploadTicket {
  return {
    type: "multipart",
    partSizeBytes: CHUNK,
    parts: partNumbers.map((partNumber) => ({
      partNumber,
      url: bucket.partUrlFor(KEY, partNumber),
    })),
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}

function putTicket(bucket: FakeBucket): UploadTicket {
  return {
    type: "put",
    url: bucket.putUrlFor(KEY),
    method: "PUT",
    headers: { "Content-Type": "application/x-step" },
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}

describe("upload engine", () => {
  let bucket: FakeBucket;

  beforeEach(async () => {
    bucket = await startFakeBucket();
  });

  afterEach(async () => {
    await bucket.close();
    vi.restoreAllMocks();
  });

  it("sends a small file in one request", async () => {
    const h = harness(putTicket(bucket));
    const upload = startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(1024),
      meta,
    });

    const file = await upload.done;
    expect(file.status).toBe("ready");
    expect(bucket.objects.get(KEY)?.byteLength).toBe(1024);
    expect(upload.getState().status).toBe("uploaded");
  });

  it("chunks a large file on the advertised boundary and confirms once", async () => {
    const h = harness(resumableTicket(bucket));
    const upload = startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(CHUNK * 2 + 100),
      meta,
    });

    await upload.done;
    expect(bucket.objects.get(KEY)?.byteLength).toBe(CHUNK * 2 + 100);
    const ranges = bucket.requests
      .filter(
        (r) =>
          r.contentRange?.startsWith("bytes 0") || r.contentRange?.includes("-")
      )
      .map((r) => r.contentRange);
    expect(ranges).toContain(`bytes 0-${CHUNK - 1}/${CHUNK * 2 + 100}`);
    expect(ranges).toContain(
      `bytes ${CHUNK}-${CHUNK * 2 - 1}/${CHUNK * 2 + 100}`
    );
    expect(h.completes).toHaveLength(1);
  });

  it("sends a multipart upload part by part and confirms once", async () => {
    const h = harness(multipartTicket(bucket, [1, 2, 3]));
    const upload = startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(CHUNK * 2 + 100),
      meta,
    });

    await upload.done;
    const landed = bucket.parts.get(KEY);
    expect([...(landed?.keys() ?? [])].sort()).toEqual([1, 2, 3]);
    expect(landed?.get(1)?.byteLength).toBe(CHUNK);
    expect(landed?.get(3)?.byteLength).toBe(100);
    expect(h.completes).toHaveLength(1);
  });

  it("resumes a multipart upload with only the parts still missing", async () => {
    // What the server hands back after listing what already landed.
    const h = harness(multipartTicket(bucket, [3]));
    const upload = startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(CHUNK * 2 + 100),
      meta,
      events: {},
    });

    await upload.done;
    expect([...(bucket.parts.get(KEY)?.keys() ?? [])]).toEqual([3]);
    // The two parts already in the bucket count as progress from the start.
    const state = upload.getState();
    expect(state.status).toBe("uploaded");
    expect(
      bucket.requests.filter((r) => r.path.startsWith("/part/"))
    ).toHaveLength(1);
  });

  it("reports progress monotonically", async () => {
    const h = harness(resumableTicket(bucket));
    const seen: number[] = [];
    await startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(CHUNK * 3),
      meta,
      events: { onProgress: ({ progress }) => seen.push(progress) },
    }).done;

    expect(seen.length).toBeGreaterThan(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen.at(-1)).toBe(1);
  });

  it("resumes from the committed offset instead of re-sending", async () => {
    // Interrupt the first attempt with its second chunk in flight, so the bucket
    // holds exactly one committed chunk when the page (or the network) dies.
    const h = harness(resumableTicket(bucket));
    const body = blobOf(CHUNK * 2);
    const stalled = bucket.stallNextChunk(1);
    const first = startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body,
      meta,
    });
    await stalled.arrived;
    await first.abort();
    stalled.release();
    await first.done.catch(() => {
      // expected: aborted
    });

    // Second attempt: a fresh engine over the same bytes.
    const before = bucket.requests.length;
    await resumeFileUpload({
      api: h.api,
      fileId: "file-1",
      body,
      meta,
    }).done;

    expect(bucket.objects.get(KEY)?.byteLength).toBe(CHUNK * 2);
    expect(h.sessions).toBe(1);
    // One probe plus the one remaining chunk — not both chunks again.
    const sent = bucket.requests
      .slice(before)
      .filter((r) => r.contentRange !== null && !r.contentRange.includes("*"));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.contentRange).toBe(
      `bytes ${CHUNK}-${CHUNK * 2 - 1}/${CHUNK * 2}`
    );
  });

  it("keeps committed bytes across a pause and continues on resume", async () => {
    const h = harness(resumableTicket(bucket));
    const stalled = bucket.stallNextChunk(1);
    const upload = startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(CHUNK * 3),
      meta,
    });

    // Chunk 1 is committed, chunk 2 is mid-flight.
    await stalled.arrived;
    upload.pause();
    stalled.release();

    const paused = upload.getState();
    expect(paused.status).toBe("uploading");
    expect(paused.status === "uploading" && paused.paused).toBe(true);
    expect(paused.status === "uploading" && paused.sentBytes).toBe(CHUNK);

    upload.resume();
    await upload.done;
    expect(bucket.objects.get(KEY)?.byteLength).toBe(CHUNK * 3);
  });

  it("succeeds when the bytes landed but the client could not read the response", async () => {
    // What a bucket with the wrong CORS origin looks like from the browser: the
    // chunks are stored, the responses are unreadable. The upload is complete;
    // only the client cannot tell. `complete` is the group, so it must not
    // be reported as a failure.
    const h = harness(putTicket(bucket), bucket);
    bucket.failAfterStoring(403);
    const upload = startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(2048),
      meta,
    });

    const file = await upload.done;
    expect(file.status).toBe("ready");
    expect(upload.getState().status).toBe("uploaded");
    expect(h.completes).toHaveLength(1);
  });

  it("asks the server instead of retrying once every byte is on the wire", async () => {
    // The chunk lands and the response is unreadable. Retrying would send
    // nothing new, so recovery asks the server straight away: no backoff, and
    // the elapsed time is what proves it (the chain would cost 7.5s).
    const h = harness(resumableTicket(bucket), bucket);
    bucket.failAfterStoring(503);
    const started = Date.now();
    const upload = startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(CHUNK),
      meta,
    });

    const file = await upload.done;
    expect(file.status).toBe("ready");
    expect(h.completes).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("retries a transient failure and gives up on a fatal one", async () => {
    const transient = harness(resumableTicket(bucket));
    bucket.failNext(1, 503);
    await startFileUpload({
      api: transient.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(CHUNK + 10),
      meta,
    }).done;
    expect(bucket.objects.get(KEY)?.byteLength).toBe(CHUNK + 10);

    const fatal = harness(putTicket(bucket), bucket);
    bucket.failNext(1, 403);
    const failed = startFileUpload({
      api: fatal.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(64),
      meta,
    });
    await expect(failed.done).rejects.toMatchObject({
      code: "UPLOAD_STORAGE_REJECTED",
    });
    // A denied signature is reported once, not retried into a hang.
    expect(
      bucket.requests.filter((r) => r.path.startsWith("/put/"))
    ).toHaveLength(1);
  });

  it("parks while offline and finishes once the connection is back", async () => {
    const h = harness(resumableTicket(bucket));
    let offline = true;
    vi.spyOn(network, "isOffline").mockImplementation(() => offline);
    vi.spyOn(network, "waitForOnline").mockImplementation(async () => {
      offline = false;
      bucket.failNext(0);
    });

    const states: FileUploadState[] = [];
    bucket.failNext(1, 500);
    const upload = startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(CHUNK + 1),
      meta,
      events: { onStateChange: (state) => states.push(state) },
    });

    await upload.done;
    expect(
      states.some((state) => state.status === "uploading" && state.offline)
    ).toBe(true);
    expect(bucket.objects.get(KEY)?.byteLength).toBe(CHUNK + 1);
  });

  it("fails loudly when the offset header is unreadable", async () => {
    // What a bucket with the wrong CORS config looks like: the chunk is accepted
    // but the client cannot see how far it got, so the loop would never advance.
    const h = harness(resumableTicket(bucket), bucket);
    bucket.hideRangeNext(1);
    const upload = startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(CHUNK * 2),
      meta,
    });

    await expect(upload.done).rejects.toMatchObject({
      code: "UPLOAD_STORAGE_REJECTED",
    });
    expect(upload.getState().status).toBe("failed");
  });

  it("abort tells the server and never confirms the file", async () => {
    const h = harness(resumableTicket(bucket));
    const stalled = bucket.stallNextChunk();
    const upload = startFileUpload({
      api: h.api,
      scope: { type: "project", projectId: "project-1" },
      body: blobOf(CHUNK * 4),
      meta,
    });

    await stalled.arrived;
    await upload.abort();
    stalled.release();

    expect(h.aborts).toEqual(["file-1"]);
    const state = upload.getState();
    expect(state.status).toBe("failed");
    expect(state.status === "failed" && state.error.code).toBe(
      "UPLOAD_ABORTED"
    );
    await expect(upload.done).rejects.toMatchObject({ code: "UPLOAD_ABORTED" });
    expect(h.completes).toHaveLength(0);
  });
});
