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
 * The `/me` routes beyond the profile itself, and the identity webhook's front
 * door. `users.e2e` covers `GET`/`PATCH /me`; the staff reads are admin-api's.
 */

interface Envelope {
  error: { code: string };
}
interface Items<T> {
  items: T[];
}

/** The pool token's type, without restating a dependency on `pg`. */
type Pool = Parameters<typeof truncateAll>[0];

const UNKNOWN = "99999999-9999-4999-8999-999999999999";

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "the rest of /me and the identity webhook (e2e)",
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

    describe("PUT/DELETE /me/metadata/:keyPath", () => {
      it("creates the missing parents a dotted path names", async () => {
        const { as } = await fixture();

        const res = await as.put("/me/metadata/apps.platform.theme", {
          value: "dark",
        });

        expect(res.status).toBe(200);
        expect((res.body as { metadata: unknown }).metadata).toEqual({
          apps: { platform: { theme: "dark" } },
        });
      });

      it("merges rather than replaces, leaving siblings alone", async () => {
        const { as } = await fixture();

        await as.put("/me/metadata/apps.platform.theme", { value: "dark" });
        const res = await as.put("/me/metadata/apps.platform.locale", {
          value: "de-DE",
        });

        expect((res.body as { metadata: unknown }).metadata).toEqual({
          apps: { platform: { theme: "dark", locale: "de-DE" } },
        });
      });

      it("removes one key, and removing an absent one is a no-op", async () => {
        const { as } = await fixture();
        await as.put("/me/metadata/apps.platform.theme", { value: "dark" });
        await as.put("/me/metadata/apps.platform.locale", { value: "de-DE" });

        const removed = await as.delete("/me/metadata/apps.platform.theme");
        expect(removed.status).toBe(200);
        expect((removed.body as { metadata: unknown }).metadata).toEqual({
          apps: { platform: { locale: "de-DE" } },
        });

        const again = await as.delete("/me/metadata/apps.platform.theme");
        expect(again.status).toBe(200);
        expect((again.body as { metadata: unknown }).metadata).toEqual({
          apps: { platform: { locale: "de-DE" } },
        });
      });

      it("is the only way in: PATCH /me cannot touch metadata", async () => {
        const { as } = await fixture();
        await as.put("/me/metadata/apps.platform.theme", { value: "dark" });

        const patched = await as.patch("/me", {
          metadata: { apps: { platform: { theme: "light" } } },
        });

        expect(patched.status).toBe(200);
        expect((patched.body as { metadata: unknown }).metadata).toEqual({
          apps: { platform: { theme: "dark" } },
        });
      });

      it("writes only the caller's own bag", async () => {
        const { as, built } = await fixture();
        const other = await makeUser(
          app.get<GraphDatabase>(GraphDatabaseToken),
          built
        );
        await as.put("/me/metadata/apps.platform.theme", { value: "dark" });

        const theirs = await req(baseUrl)
          .user({ subject: other.subject, email: other.email })
          .get("/me");

        expect((theirs.body as { metadata: unknown }).metadata).toEqual({});
      });

      it("refuses a malformed key path", async () => {
        const { as } = await fixture();

        const res = await as.put("/me/metadata/apps..theme", {
          value: "dark",
        });

        expect(res.status).toBe(400);
        expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
      });

      it("refuses an unauthenticated caller", async () => {
        const res = await req(baseUrl).put("/me/metadata/apps.platform.theme", {
          value: "dark",
        });

        expect(res.status).toBe(401);
      });
    });

    describe("GET /me/groups", () => {
      it("resolves the partitions the caller reaches, with their permits", async () => {
        const { as, org, project } = await fixture();

        const res = await as.get(`/me/groups?orgId=${org.id}`);

        expect(res.status).toBe(200);
        const items = (
          res.body as Items<{
            orgId: string;
            permits: Record<string, boolean>;
            projectId: string | null;
            standing: string | null;
          }>
        ).items;
        expect(items.length).toBeGreaterThanOrEqual(2);
        const orgRow = items.find(
          (row) => row.orgId === org.id && row.projectId === null
        );
        expect(orgRow?.standing).toBe("owner");
        expect(orgRow?.permits).toMatchObject({
          read: true,
          write: true,
          manage: true,
          admin: true,
        });
        expect(items.some((row) => row.projectId === project.id)).toBe(true);
      });

      it("reports a standing reached from above as null, with permits intact", async () => {
        const { built, org, owner, project } = await fixture();
        const member = await makeUser(
          app.get<GraphDatabase>(GraphDatabaseToken),
          built
        );
        // Granted on the org root only; the project is reached down the chain.
        await grantStanding(
          built,
          owner.principal,
          await groupOf(built, { orgId: org.id }),
          member.subject,
          "viewer"
        );

        const res = await req(baseUrl)
          .user({ subject: member.subject, email: member.email })
          .get(`/me/groups?orgId=${org.id}`);

        expect(res.status).toBe(200);
        const items = (
          res.body as Items<{
            permits: Record<string, boolean>;
            projectId: string | null;
            standing: string | null;
          }>
        ).items;
        const inherited = items.find((row) => row.projectId === project.id);
        expect(inherited?.standing).toBeNull();
        expect(inherited?.permits).toMatchObject({ read: true, admin: false });
      });

      it("answers an empty list, not an error, for somebody holding nothing", async () => {
        const { built, org } = await fixture();
        const nobody = await makeUser(
          app.get<GraphDatabase>(GraphDatabaseToken),
          built
        );

        const res = await req(baseUrl)
          .user({ subject: nobody.subject, email: nobody.email })
          .get(`/me/groups?orgId=${org.id}`);

        expect(res.status).toBe(200);
        expect((res.body as Items<unknown>).items).toEqual([]);
      });

      it("answers without a tenant named, which is the first call a client makes", async () => {
        const { as, org, project } = await fixture();

        // A client holds a token and no ids here. Demanding an organization
        // would refuse the question the route exists to answer.
        const res = await as.get("/me/groups");

        expect(res.status).toBe(200);
        const items = (
          res.body as Items<{ orgId: string; projectId: string | null }>
        ).items;
        expect(items.some((row) => row.orgId === org.id)).toBe(true);
        expect(items.some((row) => row.projectId === project.id)).toBe(true);
      });

      it("narrows to the organization named", async () => {
        const { as, built, org, owner } = await fixture();
        const other = await makeOrg(built, owner.principal);

        const res = await as.get(`/me/groups?orgId=${org.id}`);

        const items = (res.body as Items<{ orgId: string }>).items;
        expect(items.every((row) => row.orgId === org.id)).toBe(true);
        expect(items.some((row) => row.orgId === other.id)).toBe(false);
      });

      it("refuses an unauthenticated caller", async () => {
        const { org } = await fixture();

        const res = await req(baseUrl).get(`/me/groups?orgId=${org.id}`);

        expect(res.status).toBe(401);
      });
    });

    describe("the identity webhook", () => {
      it("fails closed when no shared secret is configured", async () => {
        // The test host mounts none, which is the deployment this must refuse:
        // an unconfigured secret is never a reason to let a webhook through.
        const res = await req(baseUrl).post("/webhooks/identity", {
          externalId: UNKNOWN,
          email: "someone@example.test",
        });

        expect(res.status).toBe(401);
        expect((res.body as Envelope).error.code).toBe(
          "ACCESS_PRINCIPAL_REQUIRED"
        );
      });

      it("refuses a bearer token it was never given", async () => {
        const res = await fetch(`${baseUrl}/webhooks/identity`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer not-the-secret",
          },
          body: JSON.stringify({
            externalId: UNKNOWN,
            email: "someone@example.test",
          }),
        });

        expect(res.status).toBe(401);
      });

      it("refuses the delete route the same way", async () => {
        const res = await req(baseUrl).delete(`/webhooks/identity/${UNKNOWN}`);

        expect(res.status).toBe(401);
      });

      it("is not reachable with a caller's own session either", async () => {
        const { as } = await fixture();

        // `@Public()` takes it off the principal guard, so a signed-in caller
        // is no more authorized here than an anonymous one.
        const res = await as.post("/webhooks/identity", {
          externalId: UNKNOWN,
          email: "someone@example.test",
        });

        expect(res.status).toBe(401);
      });
    });
  }
);
