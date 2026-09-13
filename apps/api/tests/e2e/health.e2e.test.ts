import {
  bootstrapTestApp,
  dbAvailable,
  req,
} from "@aec-craft/platform-testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HealthModule } from "../../src/health/health.module";

describe.skipIf(!dbAvailable())("/health, /ready, /version (e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    // The host's own module, which the testing package cannot import.
    ({ app, baseUrl } = await bootstrapTestApp({ imports: [HealthModule] }));
  });

  afterAll(async () => {
    await app.close();
  });

  it("/health → 200 { status: 'ok' }", async () => {
    const res = await req(baseUrl).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("/ready → 204 when DB is reachable", async () => {
    const res = await req(baseUrl).get("/ready");
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it("/version → 200 with build metadata", async () => {
    const res = await req(baseUrl).get("/version");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      version: expect.any(String),
      nodeVersion: process.version,
    });
  });
});
