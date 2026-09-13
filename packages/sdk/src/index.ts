// `@aec-craft/platform-sdk` — typed HTTP client for the platform API host.
//
// Promise-based, framework-neutral, isomorphic (browser + Node 18+ + edge).
// Method names mirror the server's CRUD vocabulary: `list`, `findById` (or
// `findByUser` / `findByName` when the route is keyed by something other
// than the row id), `create`, `update`, `delete`.
//
// The full wire surface from `@aec-craft/platform-contracts` is re-exported below
// — consumers depend on this single package and never see contracts directly.
// Errors are thrown as `PlatformError`; callers can switch on `err.code` (or
// `err.code === OrgErrors.SLUG_TAKEN.code`) to handle specific failures.
//
// The agent runtime (`AgentClient` + `Session`) ships here too — it is the same
// threads/runs surface as `PlatformClient.threads`, packaged for apps that need
// nothing else. React bindings live under `@aec-craft/platform-sdk/react`.

import { AnalysisClient } from "./analysis/analysis.client";
import { AuditClient } from "./audit/audit.client";
import { Http, type PlatformClientOptions } from "./common/http";
import { FileClient } from "./files/file.client";
import { GraphClient } from "./graph/graph.client";
import { ObjectClient } from "./objects/object.client";
import { MemberClient } from "./tenancy/member.client";
import { OrgClient } from "./tenancy/org.client";
import { ProjectClient } from "./tenancy/project.client";
import { ThreadClient } from "./threads/thread.client";
import { MeClient } from "./users/me.client";

// Re-export the full contracts surface: response/input types, error specs,
// permission catalogs, `PlatformError`, `USER_ROLES`, etc.
export * from "@aec-craft/platform-contracts";
export { AnalysisClient } from "./analysis/analysis.client";
export { AuditClient } from "./audit/audit.client";
export {
  Http,
  type PlatformClientOptions,
  type RequestOptions,
} from "./common/http";
export { ScopedMetadataClient } from "./common/metadata.client";
export { qs } from "./common/qs";
export { FileClient } from "./files/file.client";
export { FileIndexClient } from "./files/file.index.client";
// Upload engine: the client half of the resumable protocol. Its vocabulary
// (`FileUploadState`, `UploadErrors`, the state guards) comes from contracts and
// is re-exported with the rest of that surface above; these are the types the
// engine itself introduces.
export type {
  FileUpload,
  UploadEvents,
  UploadMeta,
} from "./files/upload/upload.engine";
export { GraphClient } from "./graph/graph.client";
export { GraphEdgeClient } from "./graph/graph.edge.client";
export { GraphNodeClient } from "./graph/graph.node.client";
export { GraphQueryClient } from "./graph/graph.query.client";
export { ObjectClient } from "./objects/object.client";
export { MemberClient } from "./tenancy/member.client";
export { OrgClient } from "./tenancy/org.client";
export { ProjectClient } from "./tenancy/project.client";
// Agent runtime: the same threads/runs clients the platform client exposes,
// packaged standalone for apps that only talk to the agent.
export { AgentClient } from "./threads/agent.client";
export {
  type Reply,
  type SendOptions,
  Session,
  type SessionOptions,
} from "./threads/session";
export { ThreadClient } from "./threads/thread.client";
export { ThreadMessageClient } from "./threads/thread.message.client";
export {
  ThreadRunClient,
  type WaitOptions,
} from "./threads/thread.run.client";
export { MeClient, MeMetadataClient } from "./users/me.client";

/**
 * Top-level platform client. Construct once per app — `baseUrl` is captured
 * at construction time, and `getAuthHeaders` is invoked per request so the
 * caller controls token refresh.
 *
 *   const client = new PlatformClient({
 *     baseUrl: "https://api.example.com",
 *     getAuthHeaders: async () => ({ Authorization: `Bearer ${await token()}` }),
 *   });
 *   const orgs = await client.orgs.list();
 *   await client.members.add({ type: "org", orgId }, { email, standing: "editor" });
 */
export class PlatformClient {
  readonly me: MeClient;
  readonly members: MemberClient;
  readonly orgs: OrgClient;
  readonly projects: ProjectClient;
  readonly files: FileClient;
  readonly threads: ThreadClient;
  readonly graph: GraphClient;
  readonly audit: AuditClient;
  readonly analysis: AnalysisClient;
  readonly objects: ObjectClient;

  constructor(options: PlatformClientOptions) {
    const http = new Http(options);
    this.me = new MeClient(http);
    this.members = new MemberClient(http);
    this.orgs = new OrgClient(http);
    this.projects = new ProjectClient(http);
    this.files = new FileClient(http);
    this.threads = new ThreadClient(http);
    this.graph = new GraphClient(http);
    this.audit = new AuditClient(http);
    this.analysis = new AnalysisClient(http);
    this.objects = new ObjectClient(http);
  }
}
export { UploadErrors } from "./files/upload/upload.errors";
