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
 * `PUT`/`DELETE` on `/orgs/:orgId/metadata/:keyPath` and
 * `/projects/:projectId/metadata/:keyPath`.
 *
 * The merge semantics are covered against the services next door. What is
 * asserted here is what only the wire has: that a dotted key path survives the
 * route, that both writes answer the whole resource rather than the bag, that
 * `PATCH` on the parent cannot reach metadata, and that both demand `manage`.
 */

interface Envelope {
  error: { code: string };
}
interface WithMetadata {
  id: string;
  metadata: Record<string, unknown>;
}

/** The pool token's type, without restating a dependency on `pg`. */
type Pool = Parameters<typeof truncateAll>[0];

const UNKNOWN = "99999999-9999-4999-8999-999999999999";

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "org + project metadata (e2e)",
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
      const project = await makeProject(built, org.id, owner.principal);
      return {
        as: req(baseUrl).user({ subject: owner.subject, email: owner.email }),
        built,
        org,
        owner,
        project,
      };
    }

    /** The two scopes answer the same shape, so they take the same tests. */
    const scopes = [
      { missing: "ORG_NOT_FOUND", name: "org", segment: "orgs" },
      { missing: "PROJECT_NOT_FOUND", name: "project", segment: "projects" },
    ] as const;

    for (const scope of scopes) {
      describe(`${scope.name} metadata`, () => {
        const idOf = (f: Awaited<ReturnType<typeof fixture>>) =>
          scope.segment === "orgs" ? f.org.id : f.project.id;

        it("creates the missing parents a dotted path names", async () => {
          const f = await fixture();

          const res = await f.as.put(
            `/${scope.segment}/${idOf(f)}/metadata/apps.platform.theme`,
            { value: "dark" }
          );

          expect(res.status).toBe(200);
          expect((res.body as WithMetadata).metadata).toEqual({
            apps: { platform: { theme: "dark" } },
          });
        });

        it("merges rather than replaces, leaving siblings alone", async () => {
          const f = await fixture();
          const base = `/${scope.segment}/${idOf(f)}/metadata`;

          await f.as.put(`${base}/apps.platform.theme`, { value: "dark" });
          const res = await f.as.put(`${base}/apps.platform.locale`, {
            value: "de-DE",
          });

          expect(res.status).toBe(200);
          expect((res.body as WithMetadata).metadata).toEqual({
            apps: { platform: { theme: "dark", locale: "de-DE" } },
          });
        });

        it("stores an object, an array and a null as given", async () => {
          const f = await fixture();
          const base = `/${scope.segment}/${idOf(f)}/metadata`;

          await f.as.put(`${base}/apps.viewer.camera`, {
            value: { position: [1, 2, 3], zoom: 1.5 },
          });
          await f.as.put(`${base}/apps.viewer.pinned`, { value: ["a", "b"] });
          const res = await f.as.put(`${base}/apps.viewer.last`, {
            value: null,
          });

          expect(res.status).toBe(200);
          expect((res.body as WithMetadata).metadata).toEqual({
            apps: {
              viewer: {
                camera: { position: [1, 2, 3], zoom: 1.5 },
                pinned: ["a", "b"],
                last: null,
              },
            },
          });
        });

        it("removes one key, and removing an absent one is a no-op", async () => {
          const f = await fixture();
          const base = `/${scope.segment}/${idOf(f)}/metadata`;
          await f.as.put(`${base}/apps.platform.theme`, { value: "dark" });
          await f.as.put(`${base}/apps.platform.locale`, { value: "de-DE" });

          const removed = await f.as.delete(`${base}/apps.platform.theme`);
          expect(removed.status).toBe(200);
          expect((removed.body as WithMetadata).metadata).toEqual({
            apps: { platform: { locale: "de-DE" } },
          });

          const again = await f.as.delete(`${base}/apps.platform.theme`);
          expect(again.status).toBe(200);
          expect((again.body as WithMetadata).metadata).toEqual({
            apps: { platform: { locale: "de-DE" } },
          });
        });

        it("answers the whole resource, not the bag on its own", async () => {
          const f = await fixture();

          const res = await f.as.put(
            `/${scope.segment}/${idOf(f)}/metadata/apps.platform.theme`,
            { value: "dark" }
          );

          expect(res.body).toMatchObject({
            id: idOf(f),
            name: expect.any(String),
          });
        });

        it("is the only way in: PATCH on the parent cannot touch metadata", async () => {
          const f = await fixture();
          const id = idOf(f);
          await f.as.put(
            `/${scope.segment}/${id}/metadata/apps.platform.theme`,
            {
              value: "dark",
            }
          );

          const patched = await f.as.patch(`/${scope.segment}/${id}`, {
            name: "Umbenannt",
            metadata: { apps: { platform: { theme: "light" } } },
          });

          expect(patched.status).toBe(200);
          expect((patched.body as WithMetadata).metadata).toEqual({
            apps: { platform: { theme: "dark" } },
          });
        });

        it("refuses a malformed key path", async () => {
          const f = await fixture();

          const res = await f.as.put(
            `/${scope.segment}/${idOf(f)}/metadata/apps..theme`,
            { value: "dark" }
          );

          expect(res.status).toBe(400);
          expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
        });

        it("refuses a body with no value in it", async () => {
          const f = await fixture();

          const res = await f.as.put(
            `/${scope.segment}/${idOf(f)}/metadata/apps.platform.theme`,
            {}
          );

          expect(res.status).toBe(400);
          expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
        });

        it("needs `manage`: a viewer is refused both writes", async () => {
          const f = await fixture();
          const viewer = await makeUser(
            app.get<GraphDatabase>(GraphDatabaseToken),
            f.built
          );
          await grantStanding(
            f.built,
            f.owner.principal,
            await groupOf(f.built, { orgId: f.org.id }),
            viewer.subject,
            "viewer"
          );
          const asViewer = req(baseUrl).user({
            subject: viewer.subject,
            email: viewer.email,
          });
          const base = `/${scope.segment}/${idOf(f)}/metadata`;

          const written = await asViewer.put(`${base}/apps.platform.theme`, {
            value: "dark",
          });
          const removed = await asViewer.delete(`${base}/apps.platform.theme`);

          expect(written.status).toBe(403);
          expect(removed.status).toBe(403);
        });

        it("hides the resource from somebody standing outside it", async () => {
          const f = await fixture();
          const outsider = await makeUser(
            app.get<GraphDatabase>(GraphDatabaseToken),
            f.built
          );

          const res = await req(baseUrl)
            .user({ subject: outsider.subject, email: outsider.email })
            .put(`/${scope.segment}/${idOf(f)}/metadata/apps.platform.theme`, {
              value: "dark",
            });

          expect(res.status).toBe(404);
          expect((res.body as Envelope).error.code).toBe(scope.missing);
        });

        it("answers the resource's own miss for an unknown id", async () => {
          const f = await fixture();

          const res = await f.as.put(
            `/${scope.segment}/${UNKNOWN}/metadata/apps.platform.theme`,
            { value: "dark" }
          );

          expect(res.status).toBe(404);
          expect((res.body as Envelope).error.code).toBe(scope.missing);
        });

        it("refuses an unauthenticated caller", async () => {
          const f = await fixture();

          const res = await req(baseUrl).put(
            `/${scope.segment}/${idOf(f)}/metadata/apps.platform.theme`,
            { value: "dark" }
          );

          expect(res.status).toBe(401);
        });
      });
    }
  }
);
