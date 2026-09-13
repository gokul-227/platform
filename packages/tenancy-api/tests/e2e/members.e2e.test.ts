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
  makeProject,
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

interface Envelope {
  error: { code: string };
}

interface MemberRow {
  email: string | null;
  name: string | null;
  source: "direct" | "inherited";
  standing: string;
  subject: string;
  userId: string | null;
}

/**
 * Membership over the wire: the two nested collections, and the standing
 * arithmetic answering with the documented status. The model itself is covered
 * by the service suites; what only a request shows is that the guard resolves
 * the partition from the path, and that a scope nobody may read is absent
 * rather than refused.
 */
describe.skipIf(!(dbAvailable() && ketoAvailable()))("members (e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    ({ app, baseUrl } = await bootstrapTestApp());
    await ensureMigrated(app.get<pg.Pool>(DatabasePoolToken));
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(app.get<pg.Pool>(DatabasePoolToken));
    resetSeq();
  });

  async function fixture() {
    const db = app.get<GraphDatabase>(GraphDatabaseToken);
    const services = buildServices(
      db,
      app.get<TenancyDatabase>(TenancyDatabaseToken),
      app.get<UsersDatabase>(UsersDatabaseToken),
      app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
    );
    const owner = await makeUser(db, services);
    const org = await makeOrg(services, owner.principal);
    const project = await makeProject(services, org.id, owner.principal);
    return {
      db,
      org,
      orgGroup: await groupOf(services, { orgId: org.id }),
      owner,
      project,
      projectGroup: await groupOf(services, { projectId: project.id }),
      services,
    };
  }

  const as = (user: { email: string | null; subject: string }) =>
    req(baseUrl).user({
      ...(user.email ? { email: user.email } : {}),
      subject: user.subject,
    });

  it("401s without a principal", async () => {
    const f = await fixture();
    const res = await req(baseUrl).get(`/orgs/${f.org.id}/members`);
    expect(res.status).toBe(401);
  });

  it("masks an organization the caller stands nowhere in as absent", async () => {
    const f = await fixture();
    const stranger = await makeUser(f.db, f.services);
    const res = await as(stranger).get(`/orgs/${f.org.id}/members`);
    expect(res.status).toBe(404);
  });

  describe("an organization's members", () => {
    it("adds by email, changes a standing, and removes", async () => {
      const f = await fixture();
      const person = await makeUser(f.db, f.services);
      const path = `/orgs/${f.org.id}/members`;

      const added = await as(f.owner).post(path, {
        email: person.email,
        standing: "editor",
      });
      expect(added.status).toBe(204);

      const changed = await as(f.owner).patch(`${path}/${person.subject}`, {
        standing: "manager",
      });
      expect(changed.status).toBe(204);

      const listed = await as(f.owner).get(path);
      expect(listed.status).toBe(200);
      expect((listed.body as { items: MemberRow[] }).items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            email: person.email,
            source: "direct",
            standing: "manager",
            subject: person.subject,
          }),
        ])
      );

      expect(
        (await as(f.owner).delete(`${path}/${person.subject}`)).status
      ).toBe(204);
      const after = await as(f.owner).get(path);
      expect(
        (after.body as { items: MemberRow[] }).items.map((row) => row.subject)
      ).not.toContain(person.subject);
    });

    it("refuses an address nobody has signed in with", async () => {
      const f = await fixture();
      const res = await as(f.owner).post(`/orgs/${f.org.id}/members`, {
        email: "nobody@example.test",
        standing: "viewer",
      });
      expect(res.status).toBe(404);
      expect((res.body as Envelope).error.code).toBe("MEMBER_EMAIL_UNKNOWN");
    });

    it("refuses a standing at or above the granter's own", async () => {
      const f = await fixture();
      const manager = await makeUser(f.db, f.services);
      const person = await makeUser(f.db, f.services);
      await grantStanding(
        f.services,
        f.owner.principal,
        f.orgGroup,
        manager.subject,
        "manager"
      );

      const res = await as(manager).post(`/orgs/${f.org.id}/members`, {
        email: person.email,
        standing: "manager",
      });
      expect(res.status).toBe(403);
    });

    it("lets a viewer read the list and refuses them the writes", async () => {
      const f = await fixture();
      const viewer = await makeUser(f.db, f.services);
      const person = await makeUser(f.db, f.services);
      await grantStanding(
        f.services,
        f.owner.principal,
        f.orgGroup,
        viewer.subject,
        "viewer"
      );

      const listed = await as(viewer).get(`/orgs/${f.org.id}/members`);
      expect(listed.status).toBe(200);
      expect(
        (listed.body as { items: MemberRow[] }).items.map((row) => row.subject)
      ).toContain(f.owner.subject);

      const refused = await as(viewer).post(`/orgs/${f.org.id}/members`, {
        email: person.email,
        standing: "viewer",
      });
      expect(refused.status).toBe(403);
    });
  });

  describe("a project's members", () => {
    it("names who reaches it from the organization, and says so", async () => {
      const f = await fixture();
      const res = await as(f.owner).get(`/projects/${f.project.id}/members`);
      expect(res.status).toBe(200);
      const inherited = (res.body as { items: MemberRow[] }).items.find(
        (row) => row.subject === f.owner.subject
      );
      expect(inherited?.source).toBe("inherited");
      expect(inherited?.standing).toBe("owner");
    });

    it("refuses to remove somebody who only reaches it from above", async () => {
      const f = await fixture();
      const res = await as(f.owner).delete(
        `/projects/${f.project.id}/members/${f.owner.subject}`
      );
      expect(res.status).toBe(404);
      expect((res.body as Envelope).error.code).toBe("MEMBER_NOT_FOUND");
    });

    it("adds somebody to the project alone, who is absent from the organization", async () => {
      const f = await fixture();
      const person = await makeUser(f.db, f.services);
      const added = await as(f.owner).post(
        `/projects/${f.project.id}/members`,
        { email: person.email, standing: "editor" }
      );
      expect(added.status).toBe(204);

      const onProject = await as(f.owner).get(
        `/projects/${f.project.id}/members`
      );
      expect(
        (onProject.body as { items: MemberRow[] }).items.find(
          (row) => row.subject === person.subject
        )
      ).toMatchObject({ source: "direct", standing: "editor" });

      const onOrg = await as(f.owner).get(`/orgs/${f.org.id}/members`);
      expect(
        (onOrg.body as { items: MemberRow[] }).items.map((row) => row.subject)
      ).not.toContain(person.subject);
    });

    it("masks a project the caller stands nowhere in as absent", async () => {
      const f = await fixture();
      const stranger = await makeUser(f.db, f.services);
      const res = await as(stranger).get(`/projects/${f.project.id}/members`);
      expect(res.status).toBe(404);
    });
  });
});
