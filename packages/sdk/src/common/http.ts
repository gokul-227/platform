import { PlatformError } from "@aec-craft/platform-contracts";

const LEADING_SPACE = /^ /;

export interface PlatformClientOptions {
  /** Base URL — e.g. `"https://api.example.com"` (no trailing slash). */
  baseUrl: string;
  /** Headers merged into every request (e.g. `X-Client-Name`). */
  defaultHeaders?: Record<string, string>;
  /** Custom fetch — defaults to global `fetch`. Used in tests + polyfilled envs. */
  fetch?: typeof fetch;
  /**
   * Called per request to attach auth headers. Return a Bearer auth header,
   * a session cookie surrogate, dev-mode `X-User-Id` / `X-User-Email`, etc.
   * Re-invoked per request so token refresh is the caller's call.
   */
  getAuthHeaders?: () =>
    | Promise<Record<string, string>>
    | Record<string, string>;
}

/** Per-request knobs. `signal` lets callers cancel in-flight reads — React
 *  Query passes one per `queryFn`, so a superseded list/search request aborts
 *  instead of running its (e.g. ILIKE) scan to completion. */
export interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * Low-level HTTP client used by the resource clients. Resource clients call
 * `get` / `post` / `patch` / `put` / `delete`; this handles header assembly,
 * body serialization, 204 short-circuit, and error envelope → `PlatformError`.
 */
export class Http {
  constructor(private readonly options: PlatformClientOptions) {}

  private async headers(
    extra?: Record<string, string>
  ): Promise<Record<string, string>> {
    return {
      ...this.options.defaultHeaders,
      ...(await this.options.getAuthHeaders?.()),
      ...extra,
    };
  }

  private get fetchImpl(): typeof fetch {
    // Bind to the global: `window.fetch` invoked as a method (`this.fetchImpl(...)`)
    // runs with `this` set to this `Http` instance, which browsers reject with
    // "Illegal invocation". A caller-supplied `fetch` is used as given.
    return this.options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const headers = await this.headers(
      body === undefined ? {} : { "Content-Type": "application/json" }
    );
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    if (options?.signal) {
      init.signal = options.signal;
    }
    const res = await this.fetchImpl(`${this.options.baseUrl}${path}`, init);
    if (!res.ok) {
      throw await toPlatformError(res);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }
  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  /**
   * GET a `text/event-stream` and yield each event's parsed JSON `data`. Ends
   * when the server closes the stream; pass `signal` to stop early (aborts the
   * fetch). Used for run streaming (`threads.runs.stream`).
   */
  async *stream<T>(path: string, options?: RequestOptions): AsyncGenerator<T> {
    const headers = await this.headers({ Accept: "text/event-stream" });
    const init: RequestInit = { method: "GET", headers };
    if (options?.signal) {
      init.signal = options.signal;
    }
    const res = await this.fetchImpl(`${this.options.baseUrl}${path}`, init);
    if (!res.ok) {
      throw await toPlatformError(res);
    }
    if (!res.body) {
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder
          .decode(value, { stream: true })
          .replace(/\r\n/g, "\n");
        let split = buffer.indexOf("\n\n");
        while (split !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).replace(LEADING_SPACE, ""))
            .join("\n");
          if (data) {
            yield JSON.parse(data) as T;
          }
          split = buffer.indexOf("\n\n");
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

interface WireErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    description?: string;
    details?: unknown;
  };
}

async function toPlatformError(res: Response): Promise<PlatformError> {
  const env = (await res.json().catch(() => null)) as WireErrorEnvelope | null;
  const e = env?.error;
  const spec = {
    code: e?.code ?? "HTTP_ERROR",
    status: res.status,
    name: e?.message ?? res.statusText,
    description: e?.description ?? "",
  };
  return new PlatformError(
    spec,
    e?.message,
    e?.details === undefined ? undefined : { details: e.details }
  );
}
