import {
  AuthenticationErrors,
  AuthorizationErrors,
} from "@aec-craft/platform-contracts";
import { MemberErrors, OrgErrors } from "@aec-craft/platform-tenancy-api";
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

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "/admin/orgs (e2e)",
  () => {
    let app: INestApplication;
    let baseUrl: string;

    const servicesOf = () =>
      buildServices(
        app.get<GraphDatabase>(GraphDatabaseToken),
        app.get<TenancyDatabase>(TenancyDatabaseToken),
        app.get<UsersDatabase>(UsersDatabaseToken),
        app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
      );

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

    it("401s when no principal header is present", async () => {
      const res = await req(baseUrl).get("/admin/orgs");
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        error: { code: AuthenticationErrors.PRINCIPAL_REQUIRED.code },
      });
    });

    it("403s a signed-in caller who is not a staff member", async () => {
      const services = servicesOf();
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const member = await makeUser(db, services);
      await makeOrg(services, member.principal);

      const res = await req(baseUrl)
        .user({ subject: member.subject, email: member.email })
        .get("/admin/orgs");
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        error: { code: AuthorizationErrors.STAFF_REQUIRED.code },
      });
    });

    it("lists every org, including ones the staff member holds nothing on", async () => {
      const services = servicesOf();
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const stranger = await makeUser(db, services);
      const staff = await makeUser(db, services, {
        staffRole: "admin",
      });
      const theirs = await makeOrg(services, stranger.principal, {
        name: "Stranger Co",
      });

      // The same caller, through the ordinary route, sees none of it: the
      // difference between the two doors is the visibility predicate.
      const scoped = await req(baseUrl)
        .user({
          subject: staff.subject,
          email: staff.email,
          staffRole: "admin",
        })
        .get("/orgs");
      expect(scoped.status).toBe(200);
      expect((scoped.body as { items: unknown[] }).items).toHaveLength(0);

      const res = await req(baseUrl)
        .user({
          subject: staff.subject,
          email: staff.email,
          staffRole: "admin",
        })
        .get("/admin/orgs");
      expect(res.status).toBe(200);
      const items = (res.body as { items: Array<{ id: string }> }).items;
      expect(items.map((item) => item.id)).toContain(theirs.id);
    });

    it("reads and updates an org the staff member holds nothing on", async () => {
      const services = servicesOf();
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const stranger = await makeUser(db, services);
      const staff = await makeUser(db, services, {
        staffRole: "admin",
      });
      const theirs = await makeOrg(services, stranger.principal);
      const asStaff = req(baseUrl).user({
        subject: staff.subject,
        email: staff.email,
        staffRole: "admin",
      });

      const read = await asStaff.get(`/admin/orgs/${theirs.id}`);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({ id: theirs.id });

      const patched = await asStaff.patch(`/admin/orgs/${theirs.id}`, {
        name: "Renamed by a staff member",
      });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ name: "Renamed by a staff member" });
    });

    it("404s an org that does not exist", async () => {
      const services = servicesOf();
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const staff = await makeUser(db, services, {
        staffRole: "admin",
      });

      const res = await req(baseUrl)
        .user({
          subject: staff.subject,
          email: staff.email,
          staffRole: "admin",
        })
        .get("/admin/orgs/00000000-0000-4000-8000-000000000000");
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: { code: OrgErrors.NOT_FOUND.code },
      });
    });

    // Was "offers no create and no delete", which asserted these routes were
    // absent. Onboarding needed a first organization set up for a customer, so
    // they exist now. What is asserted instead is the property that made their
    // absence right in the first place: a staff create names an owner and does
    // not make the caller one.
    it("creates for a named owner without joining the organization", async () => {
      const services = servicesOf();
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const staff = await makeUser(db, services, {
        staffRole: "admin",
      });
      const owner = await makeUser(db, services);
      const asStaff = req(baseUrl).user({
        subject: staff.subject,
        email: staff.email,
        staffRole: "admin",
      });

      const created = await asStaff.post("/admin/orgs", {
        name: "Onboarded",
        ownerEmail: owner.email,
      });
      expect(created.status).toBe(201);

      const members = await asStaff.get(
        `/admin/orgs/${created.body.id}/members`
      );
      const subjects = members.body.items.map(
        (m: { subject: string }) => m.subject
      );
      expect(subjects).toContain(owner.subject);
      expect(subjects).not.toContain(staff.subject);
    });

    it("refuses an owner the platform has never seen", async () => {
      const services = servicesOf();
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const staff = await makeUser(db, services, {
        staffRole: "admin",
      });
      const asStaff = req(baseUrl).user({
        subject: staff.subject,
        email: staff.email,
        staffRole: "admin",
      });

      const res = await asStaff.post("/admin/orgs", {
        name: "No owner",
        ownerEmail: "nobody@example.test",
      });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: { code: MemberErrors.EMAIL_UNKNOWN.code },
      });
    });

    it("deletes one", async () => {
      const services = servicesOf();
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const staff = await makeUser(db, services, {
        staffRole: "admin",
      });
      const member = await makeUser(db, services);
      const org = await makeOrg(services, member.principal);
      const asStaff = req(baseUrl).user({
        subject: staff.subject,
        email: staff.email,
        staffRole: "admin",
      });

      expect((await asStaff.delete(`/admin/orgs/${org.id}`)).status).toBe(204);
      expect((await asStaff.get(`/admin/orgs/${org.id}`)).status).toBe(404);
    });
  }
);
