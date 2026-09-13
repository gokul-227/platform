import type {
  CreateMemberInput,
  GroupStanding,
  MemberListQuery,
  MemberListResponse,
  MemberResponse,
} from "@aec-craft/platform-contracts";
import type { Http } from "@aec-craft/platform-sdk";
import { qs } from "@aec-craft/platform-sdk";

/**
 * A tenant's roster, administered from outside it.
 *
 * `platform-sdk`'s `MemberClient` answers from what the caller holds in the
 * organization, which is the right rule for a tenant and the wrong one for
 * support: this exists for an organization nobody left can administer. So there
 * is no escalation ceiling here and `owner` may be granted, and every write
 * lands in the tenant's own audit feed marked as ours.
 *
 * Organizations only. A project's roster is reachable through the organization
 * above it, and no staff surface addresses a project directly.
 */
export class AdminMemberClient {
  constructor(private readonly http: Http) {}

  private path(orgId: string, subject?: string): string {
    const base = `/admin/orgs/${encodeURIComponent(orgId)}/members`;
    return subject ? `${base}/${encodeURIComponent(subject)}` : base;
  }

  list = (
    orgId: string,
    query: MemberListQuery = {}
  ): Promise<MemberListResponse> =>
    this.http.get<MemberListResponse>(`${this.path(orgId)}${qs(query)}`);

  findBySubject = (orgId: string, subject: string): Promise<MemberResponse> =>
    this.http.get<MemberResponse>(this.path(orgId, subject));

  add = (orgId: string, input: CreateMemberInput): Promise<void> =>
    this.http.post<void>(this.path(orgId), input);

  /** Delete-then-write server-side, so this never leaves two standings held. */
  setStanding = (
    orgId: string,
    subject: string,
    standing: GroupStanding
  ): Promise<void> =>
    this.http.patch<void>(this.path(orgId, subject), { standing });

  remove = (orgId: string, subject: string): Promise<void> =>
    this.http.delete<void>(this.path(orgId, subject));
}
