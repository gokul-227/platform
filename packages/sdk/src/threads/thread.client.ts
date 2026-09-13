import type {
  CreateThreadInput,
  ThreadListInput,
  ThreadListResponse,
  ThreadResponse,
  ThreadScope,
  UpdateThreadInput,
} from "@aec-craft/platform-contracts";
import type { Http } from "../common/http";
import { ScopedMetadataClient } from "../common/metadata.client";
import { qs } from "../common/qs";
import { scopeQuery } from "../common/scope";
import { Session, type SessionOptions } from "./session";
import { ThreadMessageClient } from "./thread.message.client";
import { ThreadRunClient } from "./thread.run.client";

/**
 * Chat threads, with nested message and run sub-clients. One method per server
 * operation; scope rides in the request (query on list, body on create,
 * resolved + ownership-checked from the row for by-id ops).
 *
 *   client.threads.list({ type: "project", projectId })
 *   const thread = await client.threads.create({ type: "project", projectId }, { title })
 *   await client.threads.messages.create(thread.id, { role: "user", content })
 *   const run = await client.threads.runs.create(thread.id)
 *   // the platform generates server-side; poll the run or stream it:
 *   for await (const e of client.threads.runs.stream(thread.id, run.id)) { ... }
 */
export class ThreadClient {
  /** Metadata KV: `client.threads.metadata.set(threadId, keyPath, value)`. */
  readonly metadata: ScopedMetadataClient<ThreadResponse>;

  readonly messages: ThreadMessageClient;
  readonly runs: ThreadRunClient;

  constructor(private readonly http: Http) {
    this.metadata = new ScopedMetadataClient<ThreadResponse>(http, "threads");
    this.messages = new ThreadMessageClient(http);
    this.runs = new ThreadRunClient(http);
  }

  list = (
    scope: ThreadScope,
    query?: Omit<ThreadListInput, "orgId" | "projectId">
  ): Promise<ThreadListResponse> =>
    this.http.get<ThreadListResponse>(
      `/threads${qs({ ...scopeQuery(scope), ...query })}`
    );

  findById = (threadId: string): Promise<ThreadResponse> =>
    this.http.get<ThreadResponse>(`/threads/${encodeURIComponent(threadId)}`);

  create = (
    scope: ThreadScope,
    input: Omit<CreateThreadInput, "scope"> = {}
  ): Promise<ThreadResponse> =>
    this.http.post<ThreadResponse>("/threads", { ...input, scope });

  update = (
    threadId: string,
    input: UpdateThreadInput
  ): Promise<ThreadResponse> =>
    this.http.patch<ThreadResponse>(
      `/threads/${encodeURIComponent(threadId)}`,
      input
    );

  delete = (threadId: string): Promise<void> =>
    this.http.delete<void>(`/threads/${encodeURIComponent(threadId)}`);

  /**
   * Open a stateful session over a thread: `send` a message and get the reply,
   * `answer` the agent's questions. Creates the thread on the first `send`.
   * The ergonomic alternative to driving create -> message -> run -> stream.
   *
   *   const session = client.threads.session({ scope: { type: "project", projectId } });
   *   const reply = await session.send("doors on floor 2?", { onToken: write });
   *   if (reply.requiresAction) await session.answer("the north stairwell");
   */
  session = (options: SessionOptions): Session =>
    new Session({ threads: this }, options);
}
