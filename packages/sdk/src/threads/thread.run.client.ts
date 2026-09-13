import type {
  CreateThreadRunInput,
  SubmitThreadRunInput,
  ThreadRunListInput,
  ThreadRunListResponse,
  ThreadRunResponse,
  ThreadRunStreamEvent,
} from "@aec-craft/platform-contracts";
import { SETTLED_RUN_STATUSES } from "@aec-craft/platform-contracts";
import type { Http, RequestOptions } from "../common/http";
import { qs } from "../common/qs";

/** Options for `wait`. */
export interface WaitOptions extends RequestOptions {
  /** Poll interval in ms (default 1500). */
  pollMs?: number;
  /** Give up after this long in ms (default 120000). */
  timeoutMs?: number;
}

/** Generation run lifecycle under a thread. Create, observe, finalize. */
export class ThreadRunClient {
  constructor(private readonly http: Http) {}

  /**
   * Metadata KV: `client.threads.runs.metadata.set(threadId, runId, key, v)`.
   *
   * Inline rather than a shared sub-client: a run is the only metadata parent
   * that is itself nested, so a class taking a base and a nested segment would
   * be generic over one caller.
   */
  readonly metadata = {
    set: (
      threadId: string,
      runId: string,
      keyPath: string,
      value: unknown
    ): Promise<ThreadRunResponse> =>
      this.http.put<ThreadRunResponse>(
        this.metadataPath(threadId, runId, keyPath),
        {
          value,
        }
      ),
    delete: (
      threadId: string,
      runId: string,
      keyPath: string
    ): Promise<ThreadRunResponse> =>
      this.http.delete<ThreadRunResponse>(
        this.metadataPath(threadId, runId, keyPath)
      ),
  };

  private metadataPath(
    threadId: string,
    runId: string,
    keyPath: string
  ): string {
    return `/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/metadata/${encodeURIComponent(keyPath)}`;
  }

  list = (
    threadId: string,
    query?: ThreadRunListInput
  ): Promise<ThreadRunListResponse> =>
    this.http.get<ThreadRunListResponse>(
      `/threads/${encodeURIComponent(threadId)}/runs${qs(query)}`
    );

  findById = (threadId: string, runId: string): Promise<ThreadRunResponse> =>
    this.http.get<ThreadRunResponse>(
      `/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}`
    );

  create = (
    threadId: string,
    input: CreateThreadRunInput = {}
  ): Promise<ThreadRunResponse> =>
    this.http.post<ThreadRunResponse>(
      `/threads/${encodeURIComponent(threadId)}/runs`,
      input
    );

  cancel = (threadId: string, runId: string): Promise<ThreadRunResponse> =>
    this.http.post<ThreadRunResponse>(
      `/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/cancel`,
      {}
    );

  /** Answer a `requires_action` run's pending question; generation resumes. */
  submit = (
    threadId: string,
    runId: string,
    input: SubmitThreadRunInput
  ): Promise<ThreadRunResponse> =>
    this.http.post<ThreadRunResponse>(
      `/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/submit`,
      input
    );

  /**
   * Poll until the run settles (`complete` | `failed` | `cancelled` |
   * `requires_action`) and return it. A 429 backs off rather than failing.
   * Throws on timeout or `options.signal` abort. Prefer `stream` when the UI
   * shows tokens as they arrive; `wait` is for batch callers.
   */
  wait = async (
    threadId: string,
    runId: string,
    options: WaitOptions = {}
  ): Promise<ThreadRunResponse> => {
    const pollMs = options.pollMs ?? 1500;
    const deadline = Date.now() + (options.timeoutMs ?? 120_000);
    let run = await this.findById(threadId, runId);
    let interval = pollMs;
    while (!SETTLED_RUN_STATUSES.includes(run.status)) {
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for the run to settle.");
      }
      if (options.signal?.aborted) {
        throw new Error("Aborted.");
      }
      await sleep(interval);
      try {
        run = await this.findById(threadId, runId);
        interval = pollMs;
      } catch (err) {
        if ((err as { status?: number }).status === 429) {
          interval = Math.min(interval * 2, pollMs * 4);
          continue;
        }
        throw err;
      }
    }
    return run;
  };

  /**
   * Live stream of a run as it generates: `token` (incremental answer), `tool`
   * (name only), then `message` / `action` / `error`, closed by `done`. A run
   * that already settled replays its outcome. `options.signal` stops early.
   *
   *   for await (const e of client.threads.runs.stream(threadId, runId)) {
   *     if (e.type === "token") ui.append(e.delta);
   *   }
   */
  stream = (
    threadId: string,
    runId: string,
    options?: RequestOptions
  ): AsyncGenerator<ThreadRunStreamEvent> =>
    this.http.stream<ThreadRunStreamEvent>(
      `/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/stream`,
      options
    );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
