import type {
  CreateProjectInput,
  ProjectListInput,
  ProjectListResponse,
  ProjectResponse,
  UpdateProjectInput,
} from "@aec-craft/platform-contracts";

import type { Http } from "../common/http";
import { ScopedMetadataClient } from "../common/metadata.client";
import { qs } from "../common/qs";

export class ProjectClient {
  /** Metadata KV: `client.projects.metadata.set(projectId, keyPath, value)` / `.delete(projectId, keyPath)`. */
  readonly metadata: ScopedMetadataClient<ProjectResponse>;

  constructor(private readonly http: Http) {
    this.metadata = new ScopedMetadataClient<ProjectResponse>(http, "projects");
  }

  /** Admin-only — every project across every org. */
  list = (query?: ProjectListInput): Promise<ProjectListResponse> =>
    this.http.get<ProjectListResponse>(`/projects${qs(query)}`);
  /** Projects under a single org. */
  listByOrg = (
    orgId: string,
    query?: ProjectListInput
  ): Promise<ProjectListResponse> =>
    this.http.get<ProjectListResponse>(
      `/orgs/${encodeURIComponent(orgId)}/projects${qs(query)}`
    );
  findById = (projectId: string): Promise<ProjectResponse> =>
    this.http.get<ProjectResponse>(
      `/projects/${encodeURIComponent(projectId)}`
    );
  create = (
    orgId: string,
    input: CreateProjectInput
  ): Promise<ProjectResponse> =>
    this.http.post<ProjectResponse>(
      `/orgs/${encodeURIComponent(orgId)}/projects`,
      input
    );
  update = (
    projectId: string,
    input: UpdateProjectInput
  ): Promise<ProjectResponse> =>
    this.http.patch<ProjectResponse>(
      `/projects/${encodeURIComponent(projectId)}`,
      input
    );
  delete = (projectId: string): Promise<void> =>
    this.http.delete<void>(`/projects/${encodeURIComponent(projectId)}`);
}
