import type {
  AuditEventListInput,
  AuditEventListResponse,
  AuditEventResponse,
  Scope,
} from "@aec-craft/platform-contracts";

import type { Http, RequestOptions } from "../common/http";
import { qs } from "../common/qs";
import { scopeQuery } from "../common/scope";

/**
 * Read-only audit feed. One collection, addressed by scope: an organization's
 * events include every project under it. There is no write surface — rows are
 * emitted service-side, transactionally with the mutation they describe.
 */
export class AuditClient {
  constructor(private readonly http: Http) {}

  list = (
    scope: Scope,
    query?: AuditEventListInput,
    options?: RequestOptions
  ): Promise<AuditEventListResponse> =>
    this.http.get<AuditEventListResponse>(
      `/audit/events${qs({ ...scopeQuery(scope), ...query })}`,
      options
    );

  findById = (
    scope: Scope,
    eventId: string,
    options?: RequestOptions
  ): Promise<AuditEventResponse> =>
    this.http.get<AuditEventResponse>(
      `/audit/events/${encodeURIComponent(eventId)}${qs(scopeQuery(scope))}`,
      options
    );
}
