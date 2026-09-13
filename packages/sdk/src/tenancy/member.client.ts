import type {
  CreateMemberInput,
  GroupStanding,
  MemberListQuery,
  MemberListResponse,
  MemberResponse,
  Scope,
} from "@aec-craft/platform-contracts";

import type { Http } from "../common/http";
import { qs } from "../common/qs";
import { scopePath } from "../common/scope";

/**
 * Who is in an organization or a project, and the standing each holds.
 *
 * One client for both, because the arithmetic is the same and only the
 * partition differs. There is no role catalog to render: five standings, five
 * permits.
 *
 *   client.members.list({ type: "org", orgId })
 *   client.members.add({ type: "project", projectId }, { email, standing: "editor" })
 */
export class MemberClient {
  constructor(private readonly http: Http) {}

  private path(scope: Scope, subject?: string): string {
    const base = `${scopePath(scope)}/members`;
    return subject ? `${base}/${encodeURIComponent(subject)}` : base;
  }

  /**
   * Everyone who reaches the scope. On a project that includes the people the
   * organization carries into it, marked `inherited`; those are changed on the
   * organization rather than here.
   */
  list = (
    scope: Scope,
    query: MemberListQuery = {}
  ): Promise<MemberListResponse> =>
    this.http.get<MemberListResponse>(`${this.path(scope)}${qs(query)}`);

  /**
   * One member, by the subject the roster is keyed on. Somebody who reaches the
   * scope from above resolves here as they do in the list.
   */
  findBySubject = (scope: Scope, subject: string): Promise<MemberResponse> =>
    this.http.get<MemberResponse>(this.path(scope, subject));

  add = (scope: Scope, input: CreateMemberInput): Promise<void> =>
    this.http.post<void>(this.path(scope), input);

  /** Delete-then-write server-side, so this never leaves two standings held. */
  setStanding = (
    scope: Scope,
    subject: string,
    standing: GroupStanding
  ): Promise<void> =>
    this.http.patch<void>(this.path(scope, subject), { standing });

  remove = (scope: Scope, subject: string): Promise<void> =>
    this.http.delete<void>(this.path(scope, subject));
}
