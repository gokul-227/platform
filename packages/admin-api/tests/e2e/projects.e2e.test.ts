import {
  AuthenticationErrors,
  AuthorizationErrors,
} from "@aec-craft/platform-contracts";
import { ProjectErrors } from "@aec-craft/platform-tenancy-api";
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

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "/admin/projects (e2e)",
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

    /** A tenant with one project, owned by somebody the staff member is not. */
    const strangersProject = async () => {
      const services = servicesOf();
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const stranger = await makeUser(db, services);
      const org = await makeOrg(services, stranger.principal);
      const project = await makeProject(services, org.id, stranger.principal);
      const staff = await makeUser(db, services, {
        staffRole: "admin",
      });
      return {
        org,
        project,
        asStaff: req(baseUrl).user({
          subject: staff.subject,
          email: staff.email,
          staffRole: "admin",
        }),
        asPlainUser: req(baseUrl).user({
          subject: staff.subject,
          email: staff.email,
        }),
      };
    };

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
      const res = await req(baseUrl).get("/admin/projects");
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        error: { code: AuthenticationErrors.PRINCIPAL_REQUIRED.code },
      });
    });

    it("403s a signed-in caller who is not a staff member", async () => {
      const { asPlainUser } = await strangersProject();
      const res = await asPlainUser.get("/admin/projects");
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        error: { code: AuthorizationErrors.STAFF_REQUIRED.code },
      });
    });

    it("lists every project, where the ordinary route lists none", async () => {
      const { project, asStaff } = await strangersProject();

      const scoped = await asStaff.get("/projects");
      expect(scoped.status).toBe(200);
      expect((scoped.body as { items: unknown[] }).items).toHaveLength(0);

      const res = await asStaff.get("/admin/projects");
      expect(res.status).toBe(200);
      const items = (res.body as { items: Array<{ id: string }> }).items;
      expect(items.map((item) => item.id)).toContain(project.id);
    });

    it("narrows to one tenant through the nested route", async () => {
      const { org, project, asStaff } = await strangersProject();

      const res = await asStaff.get(`/admin/orgs/${org.id}/projects`);
      expect(res.status).toBe(200);
      const items = (res.body as { items: Array<{ id: string }> }).items;
      expect(items.map((item) => item.id)).toEqual([project.id]);

      // A tenant with no projects is an empty page, not a 404: the staff member can
      // see every org, so there is nothing to mask.
      const other = await asStaff.get(
        "/admin/orgs/00000000-0000-4000-8000-000000000000/projects"
      );
      expect(other.status).toBe(200);
      expect((other.body as { items: unknown[] }).items).toHaveLength(0);
    });

    it("reads and updates a project the staff member holds nothing on", async () => {
      const { project, asStaff } = await strangersProject();

      const read = await asStaff.get(`/admin/projects/${project.id}`);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({ id: project.id });

      const patched = await asStaff.patch(`/admin/projects/${project.id}`, {
        name: "Renamed by a staff member",
      });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ name: "Renamed by a staff member" });
    });

    it("404s a project that does not exist", async () => {
      const { asStaff } = await strangersProject();
      const res = await asStaff.get(
        "/admin/projects/00000000-0000-4000-8000-000000000000"
      );
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: { code: ProjectErrors.NOT_FOUND.code },
      });
    });

    it("offers no create and no delete", async () => {
      const { org, project, asStaff } = await strangersProject();

      expect(
        (
          await asStaff.post(`/admin/orgs/${org.id}/projects`, {
            name: "New",
          })
        ).status
      ).toBe(404);
      expect(
        (await asStaff.delete(`/admin/projects/${project.id}`)).status
      ).toBe(404);
    });
  }
);
