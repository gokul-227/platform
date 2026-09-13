import type {
  ProjectListInput,
  ProjectListResponse,
  ProjectResponse,
  UpdateProjectInput,
} from "@aec-craft/platform-contracts";
import type { Http } from "@aec-craft/platform-sdk";
import { qs } from "@aec-craft/platform-sdk";

/**
 * Every project, or every project in one tenant.
 *
 * No create and no delete: creating one invents a customer's data, and deleting
 * one takes every group beneath it.
 */
export class AdminProjectClient {
  constructor(private readonly http: Http) {}

  list = (query?: ProjectListInput): Promise<ProjectListResponse> =>
    this.http.get<ProjectListResponse>(`/admin/projects${qs(query)}`);

  listByOrg = (
    orgId: string,
    query?: ProjectListInput
  ): Promise<ProjectListResponse> =>
    this.http.get<ProjectListResponse>(
      `/admin/orgs/${encodeURIComponent(orgId)}/projects${qs(query)}`
    );

  findById = (projectId: string): Promise<ProjectResponse> =>
    this.http.get<ProjectResponse>(
      `/admin/projects/${encodeURIComponent(projectId)}`
    );

  update = (
    projectId: string,
    input: UpdateProjectInput
  ): Promise<ProjectResponse> =>
    this.http.patch<ProjectResponse>(
      `/admin/projects/${encodeURIComponent(projectId)}`,
      input
    );
}
