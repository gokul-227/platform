/**
 * Tiny fetch wrapper that adds the test principal headers and decodes JSON. Avoids
 * pulling in supertest just for a handful of e2e tests.
 *
 *   const res = await req(base).user(owner).post("/orgs", { name: "Acme" });
 *   expect(res.status).toBe(201);
 *   expect(res.body).toMatchObject({ slug: "acme" });
 *
 * `user(principal)` returns a new builder so callers can fan out parallel
 * requests for different identities without leaking headers between them.
 */

/**
 * What a test needs to act as somebody. `subject` is the whole of what
 * authorization reads; the rest is what a browser session would carry.
 */
export interface PrincipalHeaders {
  /** Defaults to `aal2` alongside a `staffRole`, which the staff gate requires. */
  aal?: string;
  email?: string;
  /** The identity schema, as consent emits it. Defaults to `staff` for a role. */
  schema?: string;
  staffRole?: string;
  subject: string;
}

export interface ResponseEnvelope {
  body: unknown;
  headers: Headers;
  status: number;
}

interface RequestBuilder {
  delete(path: string): Promise<ResponseEnvelope>;
  get(path: string): Promise<ResponseEnvelope>;
  patch(path: string, body?: unknown): Promise<ResponseEnvelope>;
  post(path: string, body?: unknown): Promise<ResponseEnvelope>;
  put(path: string, body?: unknown): Promise<ResponseEnvelope>;
  user(principal: PrincipalHeaders | undefined): RequestBuilder;
}

export function req(baseUrl: string): RequestBuilder {
  return makeBuilder(baseUrl, undefined);
}

function makeBuilder(
  baseUrl: string,
  principal: PrincipalHeaders | undefined
): RequestBuilder {
  const headers = (): Record<string, string> => {
    const out: Record<string, string> = { "content-type": "application/json" };
    if (principal) {
      out["x-test-subject"] = principal.subject;
      if (principal.staffRole) {
        out["x-test-staff-role"] = principal.staffRole;
        // A role alone is not staff any more: the gate wants the schema and a
        // second factor with it, so acting as one carries all three by default.
        out["x-test-schema"] = principal.schema ?? "staff";
        out["x-test-aal"] = principal.aal ?? "aal2";
      }
      if (principal.schema && !principal.staffRole) {
        out["x-test-schema"] = principal.schema;
      }
      if (principal.aal && !principal.staffRole) {
        out["x-test-aal"] = principal.aal;
      }
      if (principal.email) {
        out["x-test-email"] = principal.email;
      }
    }
    return out;
  };

  const send = async (
    method: string,
    path: string,
    body: unknown
  ): Promise<ResponseEnvelope> => {
    const init: RequestInit = { method, headers: headers() };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}${path}`, init);
    const text = await res.text();
    const parsed = text.length === 0 ? null : safeJson(text);
    return { status: res.status, headers: res.headers, body: parsed };
  };

  return {
    user(next: PrincipalHeaders | undefined): RequestBuilder {
      return makeBuilder(baseUrl, next);
    },
    get(path) {
      return send("GET", path, undefined);
    },
    post(path, body) {
      return send("POST", path, body);
    },
    put(path, body) {
      return send("PUT", path, body);
    },
    patch(path, body) {
      return send("PATCH", path, body);
    },
    delete(path) {
      return send("DELETE", path, undefined);
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
