// The package compiles with `types: []` so nothing in `src` can reach for a Node
// global; this helper is the one place that needs them (it runs a real server).
/// <reference types="node" />

/**
 * In-process fake of the bucket side of the upload protocol: signed PUT, the GCS
 * resumable session (`Content-Range` chunks, `bytes *​/total` offset probe,
 * 308 + `Range`), and S3-style presigned part URLs. No Docker, no credentials,
 * no network.
 *
 * Faithful where the client depends on it: a 308 carries `Range` only once bytes
 * are stored, a chunk starting anywhere but the stored size is rejected the way
 * GCS rejects it, and non-final chunks must be 256 KiB multiples.
 */

import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

const CHUNK_UNIT = 256 * 1024;

interface Session {
  complete: boolean;
  received: Buffer;
  total: number | null;
}

export interface FakeBucket {
  baseUrl: string;
  close: () => Promise<void>;
  /**
   * Store the bytes, then answer with `status` instead of the real response.
   * Models what the browser sees when a response is unreadable (a CORS origin
   * mismatch): the bucket has the bytes, the client is told nothing useful.
   */
  failAfterStoring: (status: number) => void;
  /** Fail the next `count` requests with `status` (fault injection). */
  failNext: (count: number, status?: number) => void;
  /** Answer the next `count` chunk PUTs with a 308 that has no `Range` header. */
  hideRangeNext: (count: number) => void;
  /** Objects that landed, by key. */
  objects: Map<string, Buffer>;
  /** Parts received per key, by part number — what a real ListParts would show. */
  parts: Map<string, Map<number, Buffer>>;
  partUrlFor: (key: string, partNumber: number) => string;
  putUrlFor: (key: string) => string;
  /** Requests received, for asserting chunking behaviour. */
  requests: { contentRange: string | null; method: string; path: string }[];
  /** Session URLs handed out, by key. */
  sessionUrlFor: (key: string) => string;
  /**
   * Hold a data chunk mid-flight, letting `skip` of them through first:
   * `arrived` resolves once the server has it, `release` lets it go (answered
   * 503, nothing stored — what GCS does with a chunk the client dropped). Lets a
   * test pause or abort at a known point in the transfer.
   */
  stallNextChunk: (skip?: number) => {
    arrived: Promise<void>;
    release: () => void;
  };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function startFakeBucket(): Promise<FakeBucket> {
  const objects = new Map<string, Buffer>();
  const parts = new Map<string, Map<number, Buffer>>();
  const sessions = new Map<string, Session>();
  const requests: FakeBucket["requests"] = [];
  let failures = { remaining: 0, status: 503 };
  let hiddenRanges = 0;
  let failAfterStoringStatus: number | null = null;
  let stall: {
    announce: () => void;
    released: Promise<void>;
    skip: number;
  } | null = null;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const contentRange = (req.headers["content-range"] as string) ?? null;
    requests.push({
      method: req.method ?? "GET",
      path: url.pathname,
      contentRange,
    });

    if (failures.remaining > 0) {
      failures.remaining -= 1;
      res.writeHead(failures.status).end();
      return;
    }

    const sessionKey = url.pathname.startsWith("/session/")
      ? decodeURIComponent(url.pathname.slice("/session/".length))
      : null;
    const putKey = url.pathname.startsWith("/put/")
      ? decodeURIComponent(url.pathname.slice("/put/".length))
      : null;

    if (req.method === "DELETE" && sessionKey) {
      sessions.delete(sessionKey);
      res.writeHead(204).end();
      return;
    }

    if (req.method === "PUT" && putKey) {
      objects.set(putKey, await readBody(req));
      res.writeHead(failAfterStoringStatus ?? 200).end();
      return;
    }

    // Multipart: `/part/<key>/<partNumber>`, the presigned-part-URL shape.
    const partMatch = /^\/part\/([^/]+)\/(\d+)$/.exec(url.pathname);
    if (req.method === "PUT" && partMatch) {
      const key = decodeURIComponent(partMatch[1] as string);
      const partNumber = Number(partMatch[2]);
      const byKey = parts.get(key) ?? new Map<number, Buffer>();
      parts.set(key, byKey);
      byKey.set(partNumber, await readBody(req));
      res.writeHead(200, { etag: `"part-${partNumber}"` }).end();
      return;
    }

    if (req.method === "PUT" && sessionKey) {
      const session = sessions.get(sessionKey) ?? {
        received: Buffer.alloc(0),
        total: null,
        complete: false,
      };
      sessions.set(sessionKey, session);
      const body = await readBody(req);

      const probe = /^bytes \*\/(\d+)$/.exec(contentRange ?? "");
      if (probe) {
        session.total = Number(probe[1]);
        if (session.complete) {
          res.writeHead(200).end();
          return;
        }
        res
          .writeHead(
            308,
            session.received.byteLength > 0
              ? { range: `bytes=0-${session.received.byteLength - 1}` }
              : {}
          )
          .end();
        return;
      }

      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange ?? "");
      if (!range) {
        res.writeHead(400).end("bad Content-Range");
        return;
      }
      if (stall && stall.skip > 0) {
        stall.skip -= 1;
      } else if (stall) {
        const held = stall;
        stall = null;
        held.announce();
        await held.released;
        res.writeHead(503).end();
        return;
      }
      const start = Number(range[1]);
      const end = Number(range[2]);
      session.total = Number(range[3]);
      if (start !== session.received.byteLength) {
        res.writeHead(400).end("offset mismatch");
        return;
      }
      if (body.byteLength !== end - start + 1) {
        res.writeHead(400).end("body length != Content-Range span");
        return;
      }
      const isFinal = end + 1 === session.total;
      if (!isFinal && body.byteLength % CHUNK_UNIT !== 0) {
        res.writeHead(400).end("non-final chunk must be a 256 KiB multiple");
        return;
      }

      session.received = Buffer.concat([session.received, body]);
      if (failAfterStoringStatus !== null) {
        if (isFinal) {
          session.complete = true;
          objects.set(sessionKey, session.received);
        }
        res.writeHead(failAfterStoringStatus).end();
        return;
      }
      if (isFinal) {
        session.complete = true;
        objects.set(sessionKey, session.received);
        res.writeHead(200).end();
        return;
      }
      if (hiddenRanges > 0) {
        hiddenRanges -= 1;
        res.writeHead(308).end();
        return;
      }
      res
        .writeHead(308, { range: `bytes=0-${session.received.byteLength - 1}` })
        .end();
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    objects,
    parts,
    requests,
    sessionUrlFor: (key) => `${baseUrl}/session/${encodeURIComponent(key)}`,
    putUrlFor: (key) => `${baseUrl}/put/${encodeURIComponent(key)}`,
    partUrlFor: (key, partNumber) =>
      `${baseUrl}/part/${encodeURIComponent(key)}/${partNumber}`,
    failNext(count, status = 503) {
      failures = { remaining: count, status };
    },
    failAfterStoring(status) {
      failAfterStoringStatus = status;
    },
    hideRangeNext(count) {
      hiddenRanges = count;
    },
    stallNextChunk(skip = 0) {
      let announce = () => {
        // replaced below; the promise executor runs synchronously
      };
      let release = announce;
      const arrived = new Promise<void>((resolve) => {
        announce = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      stall = { announce, released, skip };
      return { arrived, release };
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
