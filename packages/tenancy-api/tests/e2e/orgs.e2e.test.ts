import {
  AuthenticationErrors,
  AuthorizationErrors,
} from "@aec-craft/platform-contracts";
import { OrgErrors } from "@aec-craft/platform-tenancy-api";
import {
  type AuthorizationDatabase,
  AuthorizationDatabaseToken,
  bootstrapTestApp,
  buildServices,
  DatabasePoolToken,
  dbAvailable,
  ensureMigrated,
  type GraphDatabase,
  GraphDatabaseToken,
  grantStanding,
  groupOf,
  ketoAvailable,
  makeOrg,
  makeUser,
  req,
  resetSeq,
  type TenancyDatabase,
  TenancyDatabaseToken,
  truncateAll,
  type UsersDatabase,
  UsersDatabaseToken,
} from "@aec-craft/platform-testing";
import type { INestApplication } from "@nestjs/common";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe.skipIf(!(dbAvailable() && ketoAvailable()))("/orgs (e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    ({ app, baseUrl } = await bootstrapTestApp());

    // Before the first `truncateAll`, which reads `group` to clear its

    // tuples and fails on an unmigrated database rather than on an

    // assertion.

    await ensureMigrated(app.get<pg.Pool>(DatabasePoolToken));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app.get<pg.Pool>(DatabasePoolToken));
    resetSeq();
  });

  it("401s when no principal header is present", async () => {
    const res = await req(baseUrl).get("/orgs");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: { code: AuthenticationErrors.PRINCIPAL_REQUIRED.code },
    });
  });

  it("creates an org and the caller becomes the owner", async () => {
    const db = app.get<GraphDatabase>(GraphDatabaseToken);
    const services = buildServices(
      db,
      app.get<TenancyDatabase>(TenancyDatabaseToken),
      app.get<UsersDatabase>(UsersDatabaseToken),
      app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
    );
    const owner = await makeUser(db, services);

    const res = await req(baseUrl)
      .user({ subject: owner.subject, email: owner.email })
      .post("/orgs", { name: "Acme E2E" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Acme E2E", slug: "acme-e2e" });

    const list = await req(baseUrl)
      .user({ subject: owner.subject, email: owner.email })
      .get("/orgs");
    expect(list.status).toBe(200);
    const page = list.body as { items: { id: string }[]; total?: number };
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items.map((o) => o.id)).toContain(
      (res.body as { id: string }).id
    );
  });

  it("GET /orgs/:orgId hides the org from someone outside it", async () => {
    const db = app.get<GraphDatabase>(GraphDatabaseToken);
    const services = buildServices(
      db,
      app.get<TenancyDatabase>(TenancyDatabaseToken),
      app.get<UsersDatabase>(UsersDatabaseToken),
      app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
    );
    const owner = await makeUser(db, services);
    const stranger = await makeUser(db, services);
    const org = await makeOrg(services, owner.principal);

    const res = await req(baseUrl)
      .user({ subject: stranger.subject, email: stranger.email })
      .get(`/orgs/${org.id}`);

    // Not 403: that would confirm the org exists to someone with no standing
    // on it, and an invented id answers exactly the same way.
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: { code: OrgErrors.NOT_FOUND.code },
    });

    const invented = await req(baseUrl)
      .user({ subject: stranger.subject, email: stranger.email })
      .get("/orgs/99999999-9999-4999-8999-999999999999");
    expect(invented.status).toBe(res.status);
    expect(invented.body).toEqual(res.body);
  });

  it("cannot be widened from the query: the reach is the route, not a field", async () => {
    const db = app.get<GraphDatabase>(GraphDatabaseToken);
    const services = buildServices(
      db,
      app.get<TenancyDatabase>(TenancyDatabaseToken),
      app.get<UsersDatabase>(UsersDatabaseToken),
      app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
    );
    const stranger = await makeUser(db, services);
    const owner = await makeUser(db, services);
    await makeOrg(services, owner.principal);

    // `OrgListScope` is an argument the controller writes, never a request
    // field. Whatever a caller sends lands in the list input and cannot reach
    // it, so a normal caller asking for the estate still gets their own page.
    for (const query of [
      "?type=estate",
      "?scope=estate",
      "?scope=platform",
      "?type=readableBy",
    ]) {
      const res = await req(baseUrl)
        .user({ subject: stranger.subject, email: stranger.email })
        .get(`/orgs${query}`);
      expect(res.status).toBe(200);
      expect((res.body as { items: unknown[] }).items).toHaveLength(0);
    }
  });

  it("GET /orgs/:orgId 200 for the owner", async () => {
    const db = app.get<GraphDatabase>(GraphDatabaseToken);
    const services = buildServices(
      db,
      app.get<TenancyDatabase>(TenancyDatabaseToken),
      app.get<UsersDatabase>(UsersDatabaseToken),
      app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
    );
    const owner = await makeUser(db, services);
    const org = await makeOrg(services, owner.principal);

    const res = await req(baseUrl)
      .user({ subject: owner.subject, email: owner.email })
      .get(`/orgs/${org.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: org.id, slug: org.slug });
  });

  it("PATCH /orgs/:orgId needs `manage`; a viewer is refused", async () => {
    const db = app.get<GraphDatabase>(GraphDatabaseToken);
    const services = buildServices(
      db,
      app.get<TenancyDatabase>(TenancyDatabaseToken),
      app.get<UsersDatabase>(UsersDatabaseToken),
      app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
    );
    const owner = await makeUser(db, services);
    const viewer = await makeUser(db, services);
    const org = await makeOrg(services, owner.principal);
    await grantStanding(
      services,
      owner.principal,
      await groupOf(services, { orgId: org.id }),
      viewer.subject,
      "viewer"
    );

    const res = await req(baseUrl)
      .user({ subject: viewer.subject, email: viewer.email })
      .patch(`/orgs/${org.id}`, { name: "Renamed" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: { code: AuthorizationErrors.FORBIDDEN.code },
    });
  });

  it("DELETE /orgs/:orgId for the owner returns 204", async () => {
    const db = app.get<GraphDatabase>(GraphDatabaseToken);
    const services = buildServices(
      db,
      app.get<TenancyDatabase>(TenancyDatabaseToken),
      app.get<UsersDatabase>(UsersDatabaseToken),
      app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
    );
    const owner = await makeUser(db, services);
    const org = await makeOrg(services, owner.principal);

    const res = await req(baseUrl)
      .user({ subject: owner.subject, email: owner.email })
      .delete(`/orgs/${org.id}`);
    expect(res.status).toBe(204);

    // GET after delete — org gone (the caller is also no longer a member, so
    // the ContextGuard rejects first with FORBIDDEN; either way it's not 200).
    const after = await req(baseUrl)
      .user({ subject: owner.subject, email: owner.email })
      .get(`/orgs/${org.id}`);
    expect([403, 404]).toContain(after.status);
    if (after.status === 404) {
      expect(after.body).toMatchObject({
        error: { code: OrgErrors.NOT_FOUND.code },
      });
    }
  });
});
