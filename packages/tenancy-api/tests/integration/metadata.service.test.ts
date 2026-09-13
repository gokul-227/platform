import { AuthenticationErrors } from "@aec-craft/platform-contracts";
import { OrgErrors, ProjectErrors } from "@aec-craft/platform-tenancy-api";
import {
  asPrincipal,
  buildServices,
  dbAvailable,
  makeOrg,
  makeProject,
  makeUser,
  resetSeq,
  useTestDb,
} from "@aec-craft/platform-testing";
import { describe, expect, it } from "vitest";

/** An id nothing is stored under, for the not-found paths. */
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

/** A verified caller the platform has no profile row for. */
const MISSING_PRINCIPAL = asPrincipal(MISSING_ID);

describe.skipIf(!dbAvailable())("metadata KV (integration)", () => {
  const ctx = useTestDb();

  describe("user scope", () => {
    it("set creates nested parents and merges; siblings survive", async () => {
      resetSeq();
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const u = await makeUser(ctx.db, services);

      const r1 = await services.meMetadata.set(
        u.principal,
        "apps.platform.theme",
        "dark"
      );
      expect(r1.metadata).toEqual({ apps: { platform: { theme: "dark" } } });

      // A second key under the same namespace must not stomp the first.
      const r2 = await services.meMetadata.set(
        u.principal,
        "apps.platform.fov",
        60
      );
      expect(r2.metadata).toEqual({
        apps: { platform: { theme: "dark", fov: 60 } },
      });

      // A key in a different app namespace coexists.
      const r3 = await services.meMetadata.set(
        u.principal,
        "apps.viewer.grid",
        true
      );
      expect(r3.metadata).toEqual({
        apps: { platform: { theme: "dark", fov: 60 }, viewer: { grid: true } },
      });
    });

    it("stores object, array, and null values", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const u = await makeUser(ctx.db, services);
      const r = await services.meMetadata.set(
        u.principal,
        "apps.platform.layout",
        {
          panes: [1, 2],
        }
      );
      expect(r.metadata).toEqual({
        apps: { platform: { layout: { panes: [1, 2] } } },
      });
      const r2 = await services.meMetadata.set(
        u.principal,
        "apps.platform.layout",
        null
      );
      expect(r2.metadata).toEqual({ apps: { platform: { layout: null } } });
    });

    it("delete removes one key, leaving siblings; missing key is a no-op", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const u = await makeUser(ctx.db, services);
      await services.meMetadata.set(u.principal, "apps.platform.theme", "dark");
      await services.meMetadata.set(u.principal, "apps.platform.fov", 60);

      const del = await services.meMetadata.delete(
        u.principal,
        "apps.platform.theme"
      );
      expect(del.metadata).toEqual({ apps: { platform: { fov: 60 } } });

      const noop = await services.meMetadata.delete(
        u.principal,
        "apps.platform.nope"
      );
      expect(noop.metadata).toEqual({ apps: { platform: { fov: 60 } } });
    });

    it("throws USER_NOT_FOUND for an unknown id", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      await expect(
        services.meMetadata.set(MISSING_PRINCIPAL, "a.b", 1)
      ).rejects.toMatchObject({
        code: AuthenticationErrors.PRINCIPAL_NOT_PROVISIONED.code,
      });
      await expect(
        services.meMetadata.delete(MISSING_PRINCIPAL, "a.b")
      ).rejects.toMatchObject({
        code: AuthenticationErrors.PRINCIPAL_NOT_PROVISIONED.code,
      });
    });

    it("rejects a malformed key path", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const u = await makeUser(ctx.db, services);
      await expect(
        services.meMetadata.set(u.principal, "apps..platform", 1)
      ).rejects.toThrow();
    });
  });

  describe("org scope", () => {
    it("set merges and delete removes, scoped to the org bag", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);

      const set = await services.orgsMetadata.set(
        org.id,
        "apps.platform.flag",
        true,
        owner.principal
      );
      expect(set.metadata).toEqual({ apps: { platform: { flag: true } } });

      const del = await services.orgsMetadata.delete(
        org.id,
        "apps.platform.flag",
        owner.principal
      );
      expect(del.metadata).toEqual({ apps: { platform: {} } });
    });

    it("throws ORG_NOT_FOUND for an unknown id", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      await expect(
        services.orgsMetadata.set(MISSING_ID, "a.b", 1, owner.principal)
      ).rejects.toMatchObject({
        code: OrgErrors.NOT_FOUND.code,
      });
    });
  });

  describe("project scope", () => {
    it("set merges and delete removes, scoped to the project bag", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);

      const set = await services.projectsMetadata.set(
        project.id,
        "apps.platform.units",
        "metric",
        owner.principal
      );
      expect(set.metadata).toEqual({ apps: { platform: { units: "metric" } } });

      const del = await services.projectsMetadata.delete(
        project.id,
        "apps.platform.units",
        owner.principal
      );
      expect(del.metadata).toEqual({ apps: { platform: {} } });
    });

    it("throws PROJECT_NOT_FOUND for an unknown id", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      await expect(
        services.projectsMetadata.set(MISSING_ID, "a.b", 1, owner.principal)
      ).rejects.toMatchObject({ code: ProjectErrors.NOT_FOUND.code });
    });
  });
});
