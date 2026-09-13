import { Http, type PlatformClientOptions } from "../common/http";

import type { Session, SessionOptions } from "./session";
import { ThreadClient } from "./thread.client";

/**
 * The managed agent runtime, on its own. Same threads/messages/runs surface and
 * the same `Session` as `PlatformClient.threads` — construct this instead when
 * an app only talks to the agent and never touches orgs, files, or the graph.
 *
 *   const client = new AgentClient({
 *     baseUrl: "https://api.example.com",
 *     getAuthHeaders: async () => ({ Authorization: `Bearer ${await token()}` }),
 *   });
 *   const session = client.session({ scope: { type: "project", projectId } });
 *   const reply = await session.send("doors on floor 2?", { onToken: write });
 *   if (reply.requiresAction) await session.answer("the north stairwell");
 *
 * Or drive the primitives directly: `threads.create` / `threads.messages.create` /
 * `threads.runs.create`, then `threads.runs.wait` (poll) or `threads.runs.stream`
 * (SSE); `threads.runs.submit` answers a parked question.
 */
export class AgentClient {
  readonly threads: ThreadClient;

  constructor(options: PlatformClientOptions) {
    this.threads = new ThreadClient(new Http(options));
  }

  /** Open a stateful session over a thread. See `ThreadClient.session`. */
  session(options: SessionOptions): Session {
    return this.threads.session(options);
  }
}
