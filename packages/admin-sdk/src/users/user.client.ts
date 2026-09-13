import type {
  UserListInput,
  UserListResponse,
  UserResponse,
} from "@aec-craft/platform-contracts";
import type { Http } from "@aec-craft/platform-sdk";
import { qs } from "@aec-craft/platform-sdk";

/**
 * Every person. No create and no role write: the lifecycle belongs to the
 * identity provider and the platform row follows it through the registration
 * webhook, and what somebody may do is a standing on a group. `delete` is the
 * console's half of removing an identity, called before the identity goes so a
 * last owner is refused while there is still an account to hand over from.
 */
export class AdminUserClient {
  constructor(private readonly http: Http) {}

  list = (query?: UserListInput): Promise<UserListResponse> =>
    this.http.get<UserListResponse>(`/admin/users${qs(query)}`);

  findById = (userId: string): Promise<UserResponse> =>
    this.http.get<UserResponse>(`/admin/users/${encodeURIComponent(userId)}`);

  delete = (userId: string): Promise<void> =>
    this.http.delete<void>(`/admin/users/${encodeURIComponent(userId)}`);
}
