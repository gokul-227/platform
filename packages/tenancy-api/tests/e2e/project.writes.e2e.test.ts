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
  type Services,
  type TenancyDatabase,
  TenancyDatabaseToken,
  truncateAll,
  type UsersDatabase,
  UsersDatabaseToken,
} from "@aec-craft/platform-testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The project write routes, and the global list beside them.
 *
 * `projects.e2e` covers the two reads. What is asserted here is the half a
 * service test cannot see: the status code each write answers with, that the
 * partition comes from the path so a create body carries no `orgId`, and the
 * standing each one demands — `admin` to create or delete, `manage` to rename.
 */

interface Envelope {
  error: { code: string };
}
interface Items {
  items: { id: string; name: string }[];
}

/** The pool token's type, without restating a dependency on `pg`. */
type Pool = Parameters<typeof truncateAll>[0];

const UNKNOWN = "99999999-9999-4999-8999-999999999999";

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "project writes (e2e)",
  () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      ({ app, baseUrl } = await bootstrapTestApp());
      await ensureMigrated(app.get<Pool>(DatabasePoolToken));
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(async () => {
      await truncateAll(app.get<Pool>(DatabasePoolToken));
      resetSeq();
    });

    function services(): Services {
      return buildServices(
        app.get<GraphDatabase>(GraphDatabaseToken),
        app.get<TenancyDatabase>(TenancyDatabaseToken),
        app.get<UsersDatabase>(UsersDatabaseToken),
        app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
      );
    }

    async function fixture() {
      const built = services();
      const owner = await makeUser(
        app.get<GraphDatabase>(GraphDatabaseToken),
        built
      );
      const org = await makeOrg(built, owner.principal);
      return {
        as: req(baseUrl).user({ subject: owner.subject, email: owner.email }),
        built,
        org,
        owner,
      };
    }

    /** Somebody with a standing on the org's root group, and a client for them. */
    async function member(
      built: Services,
      granter: { principal: Parameters<typeof grantStanding>[1] },
      orgId: string,
      standing: Parameters<typeof grantStanding>[4]
    ) {
      const user = await makeUser(
        app.get<GraphDatabase>(GraphDatabaseToken),
        built
      );
      await grantStanding(
        built,
        granter.principal,
        await groupOf(built, { orgId }),
        user.subject,
        standing
      );
      return {
        as: req(baseUrl).user({ subject: user.subject, email: user.email }),
        user,
      };
    }

    describe("POST /orgs/:orgId/projects", () => {
      it("answers 201 with the created project", async () => {
        const { as, org } = await fixture();

        const res = await as.post(`/orgs/${org.id}/projects`, {
          name: "Neubau Nord",
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
          name: "Neubau Nord",
          orgId: org.id,
          slug: "neubau-nord",
        });
      });

      it("takes the partition from the path, not the body", async () => {
        const { as, org } = await fixture();

        // The nested route already fixes the org, so a body naming a different
        // one cannot move the project: `orgId` is not on the create schema.
        const res = await as.post(`/orgs/${org.id}/projects`, {
          name: "Neubau Süd",
          orgId: UNKNOWN,
        });

        expect(res.status).toBe(201);
        expect((res.body as { orgId: string }).orgId).toBe(org.id);
      });

      it("suffixes a slug that is already taken in the org", async () => {
        const { as, org } = await fixture();

        const first = await as.post(`/orgs/${org.id}/projects`, {
          name: "Neubau",
          slug: "neubau",
        });
        const second = await as.post(`/orgs/${org.id}/projects`, {
          name: "Neubau",
          slug: "neubau",
        });

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect((second.body as { slug: string }).slug).not.toBe("neubau");
      });

      it("refuses a body with no name", async () => {
        const { as, org } = await fixture();

        const res = await as.post(`/orgs/${org.id}/projects`, {});

        expect(res.status).toBe(400);
        expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
      });

      it("needs `admin` on the org: a manager is refused outright", async () => {
        const { built, org, owner } = await fixture();
        const manager = await member(built, owner, org.id, "manager");

        // A member short of the standing gets an honest 403; only a caller who
        // cannot see the org at all is masked as a miss.
        const res = await manager.as.post(`/orgs/${org.id}/projects`, {
          name: "Nicht erlaubt",
        });

        expect(res.status).toBe(403);
        expect((res.body as Envelope).error.code).toBe("PERMISSION_FORBIDDEN");
      });

      it("hides an org the caller stands outside of", async () => {
        const { built, org } = await fixture();
        const outsider = await makeUser(
          app.get<GraphDatabase>(GraphDatabaseToken),
          built
        );

        const res = await req(baseUrl)
          .user({ subject: outsider.subject, email: outsider.email })
          .post(`/orgs/${org.id}/projects`, { name: "Fremd" });

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("ORG_NOT_FOUND");
      });

      it("refuses an unauthenticated caller", async () => {
        const { org } = await fixture();

        const res = await req(baseUrl).post(`/orgs/${org.id}/projects`, {
          name: "Anonym",
        });

        expect(res.status).toBe(401);
      });
    });

    describe("PATCH /projects/:projectId", () => {
      it("answers 200 with the updated project", async () => {
        const { as, built, org, owner } = await fixture();
        const project = await makeProject(built, org.id, owner.principal);

        const res = await as.patch(`/projects/${project.id}`, {
          name: "Umbenannt",
        });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: project.id, name: "Umbenannt" });
      });

      it("maps a slug already used in the org", async () => {
        const { as, built, org, owner } = await fixture();
        const first = await makeProject(built, org.id, owner.principal, {
          slug: "erstes",
        });
        const second = await makeProject(built, org.id, owner.principal, {
          slug: "zweites",
        });

        const res = await as.patch(`/projects/${second.id}`, {
          slug: first.slug,
        });

        expect(res.status).toBe(409);
        expect((res.body as Envelope).error.code).toBe("PROJECT_SLUG_TAKEN");
      });

      it("needs `manage`: a viewer may read it but not rename it", async () => {
        const { built, org, owner } = await fixture();
        const project = await makeProject(built, org.id, owner.principal);
        const viewer = await member(built, owner, org.id, "viewer");

        const read = await viewer.as.get(`/projects/${project.id}`);
        expect(read.status).toBe(200);

        const res = await viewer.as.patch(`/projects/${project.id}`, {
          name: "Nicht erlaubt",
        });

        expect(res.status).toBe(403);
        expect((res.body as Envelope).error.code).toBe("PERMISSION_FORBIDDEN");
      });

      it("answers the project's own miss for an unknown id", async () => {
        const { as } = await fixture();

        const res = await as.patch(`/projects/${UNKNOWN}`, { name: "Nichts" });

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("PROJECT_NOT_FOUND");
      });

      it("refuses an unauthenticated caller", async () => {
        const { built, org, owner } = await fixture();
        const project = await makeProject(built, org.id, owner.principal);

        const res = await req(baseUrl).patch(`/projects/${project.id}`, {
          name: "Anonym",
        });

        expect(res.status).toBe(401);
      });
    });

    describe("DELETE /projects/:projectId", () => {
      it("answers 204 with no body, and the project is gone", async () => {
        const { as, built, org, owner } = await fixture();
        const project = await makeProject(built, org.id, owner.principal);

        const res = await as.delete(`/projects/${project.id}`);

        expect(res.status).toBe(204);
        expect(res.body).toBeNull();
        const after = await as.get(`/projects/${project.id}`);
        expect(after.status).toBe(404);
      });

      it("needs `admin`: a manager may rename it but not delete it", async () => {
        const { built, org, owner } = await fixture();
        const project = await makeProject(built, org.id, owner.principal);
        const manager = await member(built, owner, org.id, "manager");

        const renamed = await manager.as.patch(`/projects/${project.id}`, {
          name: "Erlaubt",
        });
        expect(renamed.status).toBe(200);

        const res = await manager.as.delete(`/projects/${project.id}`);

        expect(res.status).toBe(403);
        expect((res.body as Envelope).error.code).toBe("PERMISSION_FORBIDDEN");
      });

      it("answers the project's own miss for an unknown id", async () => {
        const { as } = await fixture();

        const res = await as.delete(`/projects/${UNKNOWN}`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("PROJECT_NOT_FOUND");
      });

      it("refuses an unauthenticated caller", async () => {
        const { built, org, owner } = await fixture();
        const project = await makeProject(built, org.id, owner.principal);

        const res = await req(baseUrl).delete(`/projects/${project.id}`);

        expect(res.status).toBe(401);
      });
    });

    describe("GET /projects", () => {
      it("crosses organizations, listing every project the caller can read", async () => {
        const { as, built, org, owner } = await fixture();
        const second = await makeOrg(built, owner.principal, {
          name: "Zweite Firma",
        });
        const here = await makeProject(built, org.id, owner.principal, {
          name: "Alpha",
        });
        const there = await makeProject(built, second.id, owner.principal, {
          name: "Beta",
        });

        const res = await as.get("/projects");

        expect(res.status).toBe(200);
        expect((res.body as Items).items.map((p) => p.id).sort()).toEqual(
          [here.id, there.id].sort()
        );
      });

      it("shows an outsider an empty list rather than refusing them", async () => {
        const { built, org, owner } = await fixture();
        await makeProject(built, org.id, owner.principal);
        const outsider = await makeUser(
          app.get<GraphDatabase>(GraphDatabaseToken),
          built
        );

        const res = await req(baseUrl)
          .user({ subject: outsider.subject, email: outsider.email })
          .get("/projects");

        expect(res.status).toBe(200);
        expect((res.body as Items).items).toEqual([]);
      });

      it("narrows to one org, matching the nested route", async () => {
        const { as, built, org, owner } = await fixture();
        const second = await makeOrg(built, owner.principal, {
          name: "Zweite Firma",
        });
        const here = await makeProject(built, org.id, owner.principal);
        await makeProject(built, second.id, owner.principal);

        const flat = await as.get(`/projects?orgId=eq.${org.id}`);
        const nested = await as.get(`/orgs/${org.id}/projects`);

        expect(flat.status).toBe(200);
        expect((flat.body as Items).items.map((p) => p.id)).toEqual([here.id]);
        expect((nested.body as Items).items.map((p) => p.id)).toEqual([
          here.id,
        ]);
      });

      it("refuses an unauthenticated caller", async () => {
        const res = await req(baseUrl).get("/projects");

        expect(res.status).toBe(401);
      });
    });
  }
);
