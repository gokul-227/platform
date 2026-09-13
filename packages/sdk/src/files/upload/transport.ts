/**
 * Byte transport for direct-to-bucket uploads: `XMLHttpRequest` in browsers,
 * the only API that reports upload progress; `fetch` elsewhere (Node, edge,
 * tests), where progress lands in one step at the end.
 *
 * Resumable chunking needs the response *headers*, not just the status: the
 * committed offset comes back as `Range` on a 308. In the browser that header
 * is only readable if the bucket's CORS config exposes it.
 */

export interface PutRequest {
  body: Blob;
  headers?: Record<string, string>;
  onProgress?: (sentBytes: number) => void;
  signal?: AbortSignal;
  url: string;
}

export interface PutResponse {
  getHeader: (name: string) => string | null;
  status: number;
}

/** A transfer that failed below HTTP: socket reset, DNS, offline. Retryable. */
export class NetworkError extends Error {
  override readonly name = "NetworkError";
}

export function isAbortError(err: unknown): boolean {
  return (err as Error | undefined)?.name === "AbortError";
}

export function httpPut(req: PutRequest): Promise<PutResponse> {
  if (typeof XMLHttpRequest === "undefined") {
    return fetchPut(req);
  }
  return xhrPut(req);
}

function xhrPut(req: PutRequest): Promise<PutResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", req.url, true);
    for (const [key, value] of Object.entries(req.headers ?? {})) {
      xhr.setRequestHeader(key, value);
    }

    const onAbort = () => xhr.abort();
    req.signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => req.signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => req.onProgress?.(event.loaded);
    xhr.onload = () => {
      cleanup();
      resolve({
        status: xhr.status,
        getHeader: (name) => xhr.getResponseHeader(name),
      });
    };
    xhr.onerror = () => {
      cleanup();
      reject(new NetworkError("network error during upload"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("aborted", "AbortError"));
    };
    xhr.send(req.body);
  });
}

async function fetchPut(req: PutRequest): Promise<PutResponse> {
  let res: Response;
  try {
    res = await fetch(req.url, {
      method: "PUT",
      ...(req.headers ? { headers: req.headers } : {}),
      body: req.body,
      ...(req.signal ? { signal: req.signal } : {}),
      // Default redirect handling on purpose: a "resume incomplete" 308 carries
      // no `Location`, so it is delivered as an ordinary response and stays
      // readable. `redirect: "manual"` would hand back an opaque status 0 in a
      // browser and lose the offset.
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw err;
    }
    throw new NetworkError(String(err));
  }
  // Drain so keep-alive sockets stay reusable.
  await res.arrayBuffer().catch(() => new ArrayBuffer(0));
  req.onProgress?.(req.body.size);
  return { status: res.status, getHeader: (name) => res.headers.get(name) };
}

/**
 * Connectivity monitor. A real outage parks an upload instead of burning its
 * retry budget, and the engine picks up where the bucket says it left off once
 * the connection is back. Mutable so tests can stub both functions.
 */
export const network = {
  isOffline(): boolean {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  },
  waitForOnline(): Promise<void> {
    if (!network.isOffline()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        clearInterval(interval);
        if (typeof window !== "undefined") {
          window.removeEventListener("online", done);
        }
        resolve();
      };
      // The `online` event is unreliable in some webviews; poll as a fallback.
      const interval = setInterval(() => {
        if (!network.isOffline()) {
          done();
        }
      }, 2000);
      if (typeof window !== "undefined") {
        window.addEventListener("online", done);
      }
    });
  },
};
