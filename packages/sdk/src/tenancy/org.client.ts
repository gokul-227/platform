import type {
  CreateOrgInput,
  OrgListInput,
  OrgListResponse,
  OrgResponse,
  UpdateOrgInput,
} from "@aec-craft/platform-contracts";

import type { Http } from "../common/http";
import { ScopedMetadataClient } from "../common/metadata.client";
import { qs } from "../common/qs";

/**
 * The tenant row. Who is in an organization is a standing on its root group,
 * so membership lives on `client.groups` rather than here.
 */
export class OrgClient {
  /** Metadata KV: `client.orgs.metadata.set(orgId, keyPath, value)`. */
  readonly metadata: ScopedMetadataClient<OrgResponse>;

  constructor(private readonly http: Http) {
    this.metadata = new ScopedMetadataClient<OrgResponse>(http, "orgs");
  }

  list = (query?: OrgListInput): Promise<OrgListResponse> =>
    this.http.get<OrgListResponse>(`/orgs${qs(query)}`);
  findById = (orgId: string): Promise<OrgResponse> =>
    this.http.get<OrgResponse>(`/orgs/${encodeURIComponent(orgId)}`);
  create = (input: CreateOrgInput): Promise<OrgResponse> =>
    this.http.post<OrgResponse>("/orgs", input);
  update = (orgId: string, input: UpdateOrgInput): Promise<OrgResponse> =>
    this.http.patch<OrgResponse>(`/orgs/${encodeURIComponent(orgId)}`, input);
  delete = (orgId: string): Promise<void> =>
    this.http.delete<void>(`/orgs/${encodeURIComponent(orgId)}`);
}
