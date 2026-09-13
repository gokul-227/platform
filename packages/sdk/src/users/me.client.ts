import type {
  CallerStandingListResponse,
  UpdateUserInput,
  UserResponse,
} from "@aec-craft/platform-contracts";

import type { Http } from "../common/http";
import { qs } from "../common/qs";

/** Self-routes — the authenticated principal acting on their own user row. */
export class MeClient {
  /** Metadata KV: `client.me.metadata.set(keyPath, value)` / `.delete(keyPath)`. */
  readonly metadata: MeMetadataClient;

  constructor(private readonly http: Http) {
    this.metadata = new MeMetadataClient(http);
  }

  get = (): Promise<UserResponse> => this.http.get<UserResponse>("/me");
  update = (input: UpdateUserInput): Promise<UserResponse> =>
    this.http.patch<UserResponse>("/me", input);

  /**
   * What the caller holds, resolved as permits: one row per organization or
   * project they reach. A surface decides which controls exist from these rather
   * than from a standing, because a standing reaches down and the person
   * administering a project often holds nothing written on it.
   *
   * Called with nothing it spans every organization, which is what a client
   * needs before it holds an id of any kind.
   */
  standings = (orgId?: string): Promise<CallerStandingListResponse> =>
    this.http.get<CallerStandingListResponse>(`/me/groups${qs({ orgId })}`);
}

/**
 * Metadata KV for the signed-in user: `/me/metadata/:keyPath`, no id segment.
 *
 * Here rather than in `common/`: nothing else addresses metadata without a
 * parent id, so there is no second caller to share it with.
 */
export class MeMetadataClient {
  constructor(private readonly http: Http) {}

  set = (keyPath: string, value: unknown): Promise<UserResponse> =>
    this.http.put<UserResponse>(`/me/metadata/${encodeURIComponent(keyPath)}`, {
      value,
    });

  delete = (keyPath: string): Promise<UserResponse> =>
    this.http.delete<UserResponse>(
      `/me/metadata/${encodeURIComponent(keyPath)}`
    );
}
