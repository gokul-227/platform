import type {
  AdminCreateOrgInput,
  OrgListInput,
  OrgListResponse,
  OrgResponse,
  UpdateOrgInput,
} from "@aec-craft/platform-contracts";
import type { Http } from "@aec-craft/platform-sdk";
import { qs } from "@aec-craft/platform-sdk";

/**
 * Every tenant, not just the ones the caller can reach.
 *
 * `create` names the owner rather than becoming one, which is the difference
 * from `platform-sdk`'s `OrgClient.create` and the reason this could not simply
 * reuse it: a staff member setting a customer up has no business on their
 * roster.
 *
 * `delete` is irreversible today — there is no grace period yet, so nothing
 * survives it, including the audit trail of everything that happened inside.
 */
export class AdminOrgClient {
  constructor(private readonly http: Http) {}

  list = (query?: OrgListInput): Promise<OrgListResponse> =>
    this.http.get<OrgListResponse>(`/admin/orgs${qs(query)}`);

  findById = (orgId: string): Promise<OrgResponse> =>
    this.http.get<OrgResponse>(`/admin/orgs/${encodeURIComponent(orgId)}`);

  create = (input: AdminCreateOrgInput): Promise<OrgResponse> =>
    this.http.post<OrgResponse>("/admin/orgs", input);

  delete = (orgId: string): Promise<void> =>
    this.http.delete<void>(`/admin/orgs/${encodeURIComponent(orgId)}`);

  update = (orgId: string, input: UpdateOrgInput): Promise<OrgResponse> =>
    this.http.patch<OrgResponse>(
      `/admin/orgs/${encodeURIComponent(orgId)}`,
      input
    );
}
