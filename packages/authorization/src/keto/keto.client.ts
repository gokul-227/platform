import {
  AuthorizationErrors,
  PlatformError,
} from "@aec-craft/platform-contracts";
import {
  GROUP_NAMESPACE,
  type RelationTuple,
  type TupleDelta,
} from "./keto.tuples";

/**
 * The only thing that talks to Keto. Two ports because Keto serves them
 * separately and they are not equally privileged: reads answer checks, writes
 * grant anything. Deployed, both sit behind IAM.
 *
 * Every failure is a refusal, never an allow and never a `false`: an
 * unreachable authorization service must not read as a clean denial, so it
 * throws `PERMISSION_UNAVAILABLE` (503).
 */

export interface KetoClientOptions {
  /** Mint a Google identity token per target URL. Off locally. */
  identityTokens: boolean;
  readUrl: string;
  /** Milliseconds before a request is abandoned. */
  timeoutMs: number;
  writeUrl: string;
}

const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

/** Refresh a minted token this long before it expires. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export class KetoClient {
  private readonly tokens = new Map<
    string,
    { token: string; expiresAt: number }
  >();

  constructor(private readonly options: KetoClientOptions) {}

  /**
   * Does this subject hold this relation (or computed permit) on this object?
   *
   * A denial arrives as `403` with `{"allowed": false}`, on the same channel as
   * a failure, so the two are told apart by the body. Confusing them turns every
   * ordinary refusal into a 503.
   */
  async check(tuple: RelationTuple): Promise<boolean> {
    const body = await this.request<{ allowed?: boolean }>(
      this.options.readUrl,
      "/relation-tuples/check",
      { method: "POST", body: JSON.stringify(tuple), decisionOn403: true }
    );
    return body.allowed === true;
  }

  /**
   * Every tuple on an object, or naming a subject: how membership and grants are
   * read. Pages until exhausted, generously, since the count is bounded by
   * people rather than by data.
   */
  async list(filter: {
    object?: string;
    relation?: string;
    subjectId?: string;
  }): Promise<RelationTuple[]> {
    const collected: RelationTuple[] = [];
    let pageToken: string | undefined;

    do {
      const query = new URLSearchParams({ namespace: GROUP_NAMESPACE });
      if (filter.object) {
        query.set("object", filter.object);
      }
      if (filter.relation) {
        query.set("relation", filter.relation);
      }
      if (filter.subjectId) {
        query.set("subject_id", filter.subjectId);
      }
      query.set("page_size", "500");
      if (pageToken) {
        query.set("page_token", pageToken);
      }

      const page = await this.request<{
        relation_tuples?: RelationTuple[];
        next_page_token?: string;
      }>(this.options.readUrl, `/relation-tuples?${query.toString()}`, {
        method: "GET",
      });
      collected.push(...(page.relation_tuples ?? []));
      pageToken = page.next_page_token || undefined;
    } while (pageToken);

    return collected;
  }

  /**
   * Every tuple naming this object, gone. For a deleted group, whose tuples
   * would otherwise answer questions about nothing.
   *
   * Tuples where the object is the *subject* of another group's grant are not
   * reached, which is why deleting a group with children is refused.
   */
  async deleteObject(object: string): Promise<void> {
    await this.request(
      this.options.writeUrl,
      `/admin/relation-tuples?namespace=${encodeURIComponent(GROUP_NAMESPACE)}&object=${encodeURIComponent(object)}`,
      { method: "DELETE" }
    );
  }

  /**
   * Apply deltas, deletes first, in two calls. Load-bearing: Keto does not order
   * deltas inside one `PATCH`, so a delete and an insert of the same tuple net
   * to the delete, and every write here is delete-then-write. Batching them
   * would make a promotion remove the standing it was meant to grant. Verified
   * against Keto v26.
   *
   * Delete-then-write rather than `PUT`, which is not idempotent: the same tuple
   * written twice is stored twice. A failure between the two calls leaves the
   * standing removed and not re-granted, which is the safe direction, and a
   * retry converges.
   */
  async patch(deltas: TupleDelta[]): Promise<void> {
    const deletes = deltas.filter((delta) => delta.action === "delete");
    const inserts = deltas.filter((delta) => delta.action === "insert");
    for (const batch of [deletes, inserts]) {
      if (batch.length > 0) {
        await this.request(this.options.writeUrl, "/admin/relation-tuples", {
          method: "PATCH",
          body: JSON.stringify(batch),
        });
      }
    }
  }

  private async request<T>(
    baseUrl: string,
    path: string,
    init: { method: string; body?: string; decisionOn403?: boolean }
  ): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const token = await this.identityToken(baseUrl);
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers,
        ...(init.body === undefined ? {} : { body: init.body }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      throw new PlatformError(AuthorizationErrors.UNAVAILABLE, undefined, {
        cause: error,
      });
    }

    // A 403 carrying `{"allowed": false}` is an answer. A 403 without it is
    // something else refusing us (IAM in front of the service), not a decision.
    if (response.status === 403 && init.decisionOn403) {
      const decision = (await response.json().catch(() => null)) as {
        allowed?: boolean;
      } | null;
      if (decision && typeof decision.allowed === "boolean") {
        return decision as T;
      }
      throw new PlatformError(
        AuthorizationErrors.UNAVAILABLE,
        `Keto refused the caller on ${init.method} ${path}`
      );
    }

    if (!response.ok) {
      throw new PlatformError(
        AuthorizationErrors.UNAVAILABLE,
        `Keto answered ${response.status} for ${init.method} ${path}`
      );
    }

    if (response.status === 204) {
      return {} as T;
    }
    return (await response.json()) as T;
  }

  /**
   * A Google-signed identity token audienced at the target service, minted by
   * the metadata server so no key material exists anywhere. Cached until shortly
   * before expiry; failing to mint one is a refusal like any other.
   */
  private async identityToken(audience: string): Promise<string | null> {
    if (!this.options.identityTokens) {
      return null;
    }
    const cached = this.tokens.get(audience);
    if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
      return cached.token;
    }

    let token: string;
    try {
      const response = await fetch(
        `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}`,
        {
          headers: { "Metadata-Flavor": "Google" },
          signal: AbortSignal.timeout(this.options.timeoutMs),
        }
      );
      if (!response.ok) {
        throw new Error(`metadata server answered ${response.status}`);
      }
      token = (await response.text()).trim();
    } catch (error) {
      throw new PlatformError(AuthorizationErrors.UNAVAILABLE, undefined, {
        cause: error,
      });
    }

    this.tokens.set(audience, { token, expiresAt: expiryOf(token) });
    return token;
  }
}

/**
 * The `exp` claim, unverified: the token came from the metadata server over
 * loopback and only decides when to fetch the next one. Unreadable means expired
 * now, so a malformed token costs a refetch rather than an outage.
 */
function expiryOf(token: string): number {
  const payload = token.split(".")[1];
  if (!payload) {
    return 0;
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { exp?: number };
    return typeof claims.exp === "number" ? claims.exp * 1000 : 0;
  } catch {
    return 0;
  }
}
