import { Controller, Get, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { corsOptions } from "../../../src/cors";

@Controller()
class ProbeController {
  @Get("probe")
  probe(): { ok: true } {
    return { ok: true };
  }
}

/**
 * Boots the real Nest app with the real policy so the assertions are on
 * response headers a browser would read, not on the option object.
 */
async function bootWith(
  corsOriginsEnv: string | undefined
): Promise<INestApplication> {
  if (corsOriginsEnv === undefined) {
    delete process.env.CORS_ORIGINS;
  } else {
    process.env.CORS_ORIGINS = corsOriginsEnv;
  }
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  const cors = corsOptions();
  if (cors) {
    app.enableCors(cors);
  }
  await app.init();
  return app;
}

describe("CORS policy", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    delete process.env.CORS_ORIGINS;
  });

  it("`*` answers the preflight for an origin nobody registered", async () => {
    app = await bootWith("*");
    const res = await request(app.getHttpServer())
      .options("/probe")
      .set("Origin", "https://studio.example.com")
      .set("Access-Control-Request-Method", "GET");

    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("never allows credentials, which a browser rejects alongside `*`", async () => {
    app = await bootWith("*");
    const res = await request(app.getHttpServer())
      .get("/probe")
      .set("Origin", "https://studio.example.com");

    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("allows only the pinned request headers, not whatever is asked for", async () => {
    app = await bootWith("*");
    const res = await request(app.getHttpServer())
      .options("/probe")
      .set("Origin", "https://studio.example.com")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "authorization,x-user-id");

    const allowed = (res.headers["access-control-allow-headers"] ?? "")
      .toLowerCase()
      .split(",")
      .map((header: string) => header.trim());
    expect(allowed).toContain("authorization");
    expect(allowed).not.toContain("x-user-id");
  });

  it("exposes WWW-Authenticate so a browser client can read the challenge", async () => {
    app = await bootWith("*");
    const res = await request(app.getHttpServer())
      .get("/probe")
      .set("Origin", "https://studio.example.com");

    expect(res.headers["access-control-expose-headers"]).toContain(
      "WWW-Authenticate"
    );
  });

  it("refuses to boot on `*` mixed with named origins", () => {
    process.env.CORS_ORIGINS = "https://a.example.com,*";
    expect(() => corsOptions()).toThrow(/mixes/);
  });

  it("a list answers only for the origins in it", async () => {
    app = await bootWith("https://a.example.com, https://b.example.com");

    const allowed = await request(app.getHttpServer())
      .options("/probe")
      .set("Origin", "https://b.example.com")
      .set("Access-Control-Request-Method", "GET");
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://b.example.com"
    );

    const refused = await request(app.getHttpServer())
      .options("/probe")
      .set("Origin", "https://c.example.com")
      .set("Access-Control-Request-Method", "GET");
    expect(refused.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("unset sends no headers at all, so nothing in front is doubled", async () => {
    app = await bootWith(undefined);
    const res = await request(app.getHttpServer())
      .options("/probe")
      .set("Origin", "https://studio.example.com")
      .set("Access-Control-Request-Method", "GET");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("an empty setting is treated as unset, not as an empty allowlist", () => {
    process.env.CORS_ORIGINS = " , ";
    expect(corsOptions()).toBeNull();
  });
});
