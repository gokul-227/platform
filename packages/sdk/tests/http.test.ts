import { PlatformError } from "@aec-craft/platform-contracts";
import { describe, expect, it, vi } from "vitest";

import { Http } from "../src/common/http";

const baseUrl = "https://api.test";

describe("Http", () => {
  it("merges default headers and auth headers; serializes body", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })
    );
    const http = new Http({
      baseUrl,
      fetch: fetchMock,
      defaultHeaders: { "X-App": "test" },
      getAuthHeaders: () => ({ Authorization: "Bearer token-xyz" }),
    });

    await http.post<{ ok: number }>("/orgs", { name: "Acme" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe("https://api.test/orgs");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Acme" }));
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer token-xyz");
    expect(headers["X-App"]).toBe("test");
  });

  it("returns undefined on 204 (no body parsing)", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 })
    );
    const http = new Http({
      baseUrl,
      fetch: fetchMock,
    });
    await expect(http.delete<void>("/orgs/x")).resolves.toBeUndefined();
  });

  it("throws PlatformError populated from server envelope", async () => {
    const envelope = {
      error: {
        code: "ORG_SLUG_TAKEN",
        message: "Slug 'acme' is taken",
        description: "An organization with this slug already exists.",
        details: { slug: "acme" },
      },
    };
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(envelope), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
    );
    const http = new Http({
      baseUrl,
      fetch: fetchMock,
    });

    const err = await http.post("/orgs", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlatformError);
    const pe = err as PlatformError;
    expect(pe.code).toBe("ORG_SLUG_TAKEN");
    expect(pe.statusCode).toBe(409);
    expect(pe.message).toBe("Slug 'acme' is taken");
    expect(pe.description).toBe(
      "An organization with this slug already exists."
    );
    expect(pe.details).toEqual({ slug: "acme" });
  });

  it("falls back to HTTP_ERROR for non-envelope responses", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("Bad Gateway", { status: 502 })
    );
    const http = new Http({
      baseUrl,
      fetch: fetchMock,
    });
    const err = await http.get("/orgs").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlatformError);
    expect((err as PlatformError).code).toBe("HTTP_ERROR");
    expect((err as PlatformError).statusCode).toBe(502);
  });

  it("does not send a body on GET / DELETE", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("[]", { status: 200 })
    );
    const http = new Http({
      baseUrl,
      fetch: fetchMock,
    });
    await http.get("/orgs");
    const initGet = fetchMock.mock.calls[0]?.[1];
    expect(initGet?.body).toBeUndefined();
    await http.delete("/orgs/x");
    const initDel = fetchMock.mock.calls[1]?.[1];
    expect(initDel?.body).toBeUndefined();
  });
});
