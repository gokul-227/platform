import { randomUUID } from "node:crypto";

import {
  type AuditDatabase,
  AuditDatabaseToken,
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
  recordAuditEvent,
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

/** The wire shape of a feed page, as much of it as the assertions read. */
interface FeedPage {
  items: {
    actorId: string | null;
    id: string;
    resource: string;
    resourceLabel: string | null;
    verb: string;
  }[];
  nextCursor: string | null;
}

/**
 * The read-only feeds over what the other slices recorded. Both are
 * `@RequirePermit("read")` on the partition's group, so the interesting cases
 * are who the guard lets in and what the row filter leaves out afterwards.
 */
describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "/audit/events (e2e)",
  () => {
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

    function services() {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      return {
        auditDb: app.get<AuditDatabase>(AuditDatabaseToken),
        db,
        services: buildServices(
          db,
          app.get<TenancyDatabase>(TenancyDatabaseToken),
          app.get<UsersDatabase>(UsersDatabaseToken),
          app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
        ),
      };
    }

    /** An org with a project, an owner, and one file event inside the project. */
    async function fixture() {
      const { auditDb, db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const org = await makeOrg(svc, owner.principal);
      const project = await makeProject(svc, org.id, owner.principal);
      const projectGroup = await groupOf(svc, { projectId: project.id });
      await recordAuditEvent(auditDb, {
        actorId: owner.id,
        groupId: projectGroup,
        label: "plan.ifc",
        orgId: org.id,
        projectId: project.id,
        resource: "file",
        resourceId: randomUUID(),
        verb: "uploaded",
      });
      return {
        auditDb,
        db,
        org,
        orgGroup: await groupOf(svc, { orgId: org.id }),
        owner,
        project,
        projectGroup,
        services: svc,
      };
    }

    const as = (user: { email: string | null; subject: string }) =>
      req(baseUrl).user({
        ...(user.email ? { email: user.email } : {}),
        subject: user.subject,
      });

    it("401s without a principal", async () => {
      const f = await fixture();
      const res = await req(baseUrl).get(`/audit/events?orgId=${f.org.id}`);
      expect(res.status).toBe(401);
    });

    it("serves the org's own events to somebody who reads the org", async () => {
      const f = await fixture();
      const res = await as(f.owner).get(`/audit/events?orgId=${f.org.id}`);
      expect(res.status).toBe(200);

      const page = res.body as FeedPage;
      const actions = page.items.map((row) => `${row.resource}.${row.verb}`);
      expect(actions).toContain("org.created");
      expect(actions).toContain("project.created");
      // The file was uploaded inside the project, so it belongs to that feed.
      expect(actions).not.toContain("file.uploaded");
    });

    it("serves the project's events on the project's own feed", async () => {
      const f = await fixture();
      const res = await as(f.owner).get(
        `/audit/events?projectId=${f.project.id}`
      );
      expect(res.status).toBe(200);
      const page = res.body as FeedPage;
      expect(page.items.map((row) => row.resourceLabel)).toContain("plan.ifc");
    });

    it("hides the feed from an outsider the same way the org hides itself", async () => {
      const f = await fixture();
      const stranger = await makeUser(f.db, f.services);
      const res = await as(stranger).get(`/audit/events?orgId=${f.org.id}`);
      expect(res.status).toBe(404);
    });

    it("lets a viewer read it, because the permit is read", async () => {
      const f = await fixture();
      const viewer = await makeUser(f.db, f.services);
      await grantStanding(
        f.services,
        f.owner.principal,
        f.orgGroup,
        viewer.subject,
        "viewer"
      );
      const res = await as(viewer).get(`/audit/events?orgId=${f.org.id}`);
      expect(res.status).toBe(200);
    });

    it("filters and pages over the wire", async () => {
      const f = await fixture();
      const filtered = await as(f.owner).get(
        `/audit/events?orgId=${f.org.id}&resource=eq.project`
      );
      expect(filtered.status).toBe(200);
      const page = filtered.body as FeedPage;
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.resource).toBe("project");

      const firstPage = await as(f.owner).get(
        `/audit/events?orgId=${f.org.id}&limit=1`
      );
      const first = firstPage.body as FeedPage;
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).not.toBeNull();
    });

    it("rejects a sort on a cursor page, and an unknown filter operator", async () => {
      const f = await fixture();
      const sorted = await as(f.owner).get(
        `/audit/events?orgId=${f.org.id}&sort=createdAt:asc`
      );
      expect(sorted.status).toBe(400);

      const bogus = await as(f.owner).get(
        `/audit/events?orgId=${f.org.id}&verb=startsWith.crea`
      );
      expect(bogus.status).toBe(400);
    });

    it("fetches one event by id, and 404s for one outside the scope", async () => {
      const f = await fixture();
      const feed = await as(f.owner).get(
        `/audit/events?projectId=${f.project.id}`
      );
      const wanted = (feed.body as FeedPage).items.find(
        (row) => row.resourceLabel === "plan.ifc"
      );
      expect(wanted).toBeDefined();

      const one = await as(f.owner).get(
        `/audit/events/${wanted?.id}?projectId=${f.project.id}`
      );
      expect(one.status).toBe(200);
      expect((one.body as { resourceLabel: string }).resourceLabel).toBe(
        "plan.ifc"
      );

      // Same event, asked for through a sibling project it does not belong to.
      const other = await makeProject(f.services, f.org.id, f.owner.principal);
      const elsewhere = await as(f.owner).get(
        `/audit/events/${wanted?.id}?projectId=${other.id}`
      );
      expect(elsewhere.status).toBe(404);
    });

    it("fetches one event by id from the org feed too", async () => {
      const f = await fixture();
      const feed = await as(f.owner).get(`/audit/events?orgId=${f.org.id}`);
      const wanted = (feed.body as FeedPage).items[0];
      expect(wanted).toBeDefined();

      const one = await as(f.owner).get(
        `/audit/events/${wanted?.id}?orgId=${f.org.id}`
      );

      expect(one.status).toBe(200);
      expect((one.body as { id: string }).id).toBe(wanted?.id);
    });

    it("hides an event by id from somebody standing outside the org", async () => {
      const f = await fixture();
      const feed = await as(f.owner).get(`/audit/events?orgId=${f.org.id}`);
      const wanted = (feed.body as FeedPage).items[0];
      const stranger = await makeUser(f.db, f.services);

      const one = await as(stranger).get(
        `/audit/events/${wanted?.id}?orgId=${f.org.id}`
      );

      expect(one.status).toBe(404);
    });

    it("answers the event's own miss for an unknown id", async () => {
      const f = await fixture();

      const one = await as(f.owner).get(
        `/audit/events/99999999-9999-4999-8999-999999999999?orgId=${f.org.id}`
      );

      expect(one.status).toBe(404);
      expect((one.body as { error: { code: string } }).error.code).toBe(
        "AUDIT_EVENT_NOT_FOUND"
      );
    });

    it("is read-only: nothing writes an event over the wire", async () => {
      const f = await fixture();
      const res = await as(f.owner).post(`/audit/events?orgId=${f.org.id}`, {
        resource: "org",
        verb: "created",
      });
      expect(res.status).toBe(404);
    });
  }
);
