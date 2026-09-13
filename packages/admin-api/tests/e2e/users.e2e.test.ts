import {
  AuthenticationErrors,
  AuthorizationErrors,
} from "@aec-craft/platform-contracts";
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
import { UserErrors } from "@aec-craft/platform-users-api";
import type { INestApplication } from "@nestjs/common";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "/admin/users (e2e)",
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
      const res = await req(baseUrl).get("/admin/users");
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        error: { code: AuthenticationErrors.PRINCIPAL_REQUIRED.code },
      });
    });

    it("403s a signed-in caller who is not a staff member", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const nonAdmin = await makeUser(db, servicesOf());

      const res = await req(baseUrl)
        .user({ subject: nonAdmin.subject, email: nonAdmin.email })
        .get("/admin/users");
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        error: { code: AuthorizationErrors.STAFF_REQUIRED.code },
      });
    });

    it("lists every user for a staff member", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const services = servicesOf();
      const staff = await makeUser(db, services, {
        staffRole: "admin",
      });
      await makeUser(db, services);

      const res = await req(baseUrl)
        .user({
          subject: staff.subject,
          email: staff.email,
          staffRole: "admin",
        })
        .get("/admin/users");
      expect(res.status).toBe(200);
      const page = res.body as { items: unknown[]; total: number };
      expect(page.items.length).toBeGreaterThanOrEqual(2);
      expect(page.total).toBeGreaterThanOrEqual(2);
    });

    it("reads one user by id, and 404s an unknown one", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const services = servicesOf();
      const staff = await makeUser(db, services, {
        staffRole: "admin",
      });
      const other = await makeUser(db, services);
      const asStaff = req(baseUrl).user({
        subject: staff.subject,
        email: staff.email,
        staffRole: "admin",
      });

      const read = await asStaff.get(`/admin/users/${other.id}`);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({ id: other.id });
      // The staff role is the identity provider's and is not a column here.
      expect(read.body).not.toHaveProperty("staffRole");

      const missing = await asStaff.get(
        "/admin/users/00000000-0000-4000-8000-000000000000"
      );
      expect(missing.status).toBe(404);
      expect(missing.body).toMatchObject({
        error: { code: UserErrors.NOT_FOUND.code },
      });
    });

    it("finds a person by the identity provider's id", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const services = servicesOf();
      const staff = await makeUser(db, services, { staffRole: "admin" });
      const other = await makeUser(db, services);
      await makeUser(db, services);

      const res = await req(baseUrl)
        .user({
          subject: staff.subject,
          email: staff.email,
          staffRole: "admin",
        })
        .get(`/admin/users?externalId=eq.${other.subject}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: [{ id: other.id }], total: 1 });
    });

    it("deletes a person, and 404s them afterwards", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const services = servicesOf();
      const staff = await makeUser(db, services, { staffRole: "admin" });
      const other = await makeUser(db, services);
      const asStaff = req(baseUrl).user({
        subject: staff.subject,
        email: staff.email,
        staffRole: "admin",
      });

      expect((await asStaff.delete(`/admin/users/${other.id}`)).status).toBe(
        204
      );
      expect((await asStaff.get(`/admin/users/${other.id}`)).status).toBe(404);
      expect((await asStaff.delete(`/admin/users/${other.id}`)).status).toBe(
        404
      );
    });

    it("refuses to delete the only owner of an organization", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const services = servicesOf();
      const staff = await makeUser(db, services, { staffRole: "admin" });
      const owner = await makeUser(db, services);
      const org = await makeOrg(services, owner.principal);

      const res = await req(baseUrl)
        .user({
          subject: staff.subject,
          email: staff.email,
          staffRole: "admin",
        })
        .delete(`/admin/users/${owner.id}`);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: {
          code: UserErrors.DELETE_BLOCKED_LAST_OWNER.code,
          details: { groups: [expect.objectContaining({ name: org.name })] },
        },
      });
    });

    it("offers no update", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const services = servicesOf();
      const staff = await makeUser(db, services, { staffRole: "admin" });
      const other = await makeUser(db, services);

      const res = await req(baseUrl)
        .user({
          subject: staff.subject,
          email: staff.email,
          staffRole: "admin",
        })
        .patch(`/admin/users/${other.id}`, { name: "x" });
      expect(res.status).toBe(404);
    });
  }
);
