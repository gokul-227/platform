import { group } from "@aec-craft/platform-authorization";
import { PlatformError, ValidationErrors } from "@aec-craft/platform-contracts";
import { OrgErrors, project } from "@aec-craft/platform-tenancy-api";
import {
  buildServices,
  dbAvailable,
  groupOf,
  ketoAvailable,
  makeOrg,
  makeProject,
  makeUser,
  resetSeq,
  useTestDb,
} from "@aec-craft/platform-testing";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "OrgService (integration)",
  () => {
    const ctx = useTestDb();

    describe("create", () => {
      it("creates the org, its root group, and makes the creator its owner", async () => {
        resetSeq();
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);

        const org = await services.orgs.create(owner.principal, {
          name: "Acme Co",
        });
        expect(org.slug).toBe("acme-co");

        // One root group, carrying the tenant and no parent.
        const rows = await ctx.authorizationDb
          .select()
          .from(group)
          .where(eq(group.orgId, org.id));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ type: "org", parentId: null });

        // Ownership is a tuple, so it is read back from the check surface
        // rather than from a membership row: there is no longer one.
        const rootGroup = rows[0]?.id ?? "";
        await expect(
          services.checks.permitsOn(owner.principal, rootGroup)
        ).resolves.toEqual({
          own: true,
          read: true,
          write: true,
          manage: true,
          admin: true,
        });
      });

      it("derives the slug, suffixing on collision", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const a = await makeUser(ctx.db, services);
        const b = await makeUser(ctx.db, services);

        const first = await services.orgs.create(a.principal, { name: "Acme" });
        const second = await services.orgs.create(b.principal, {
          name: "Acme",
        });
        expect([first.slug, second.slug]).toEqual(["acme", "acme-2"]);
      });

      it("refuses a name no slug can be derived from", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        await expect(
          services.orgs.create(owner.principal, { name: "???" })
        ).rejects.toMatchObject({ code: ValidationErrors.FAILED.code });
      });
    });

    describe("list", () => {
      it("returns only orgs the caller can reach", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const mine = await makeUser(ctx.db, services);
        const theirs = await makeUser(ctx.db, services);
        const own = await makeOrg(services, mine.principal);
        await makeOrg(services, theirs.principal);

        const page = await services.orgs.list(
          {},
          { type: "readableBy", principal: mine.principal }
        );
        expect(page.items.map((o) => o.id)).toEqual([own.id]);
      });

      it("is an empty page, not an error, for someone in no org", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const stranger = await makeUser(ctx.db, services);
        await expect(
          services.orgs.list(
            {},
            { type: "readableBy", principal: stranger.principal }
          )
        ).resolves.toMatchObject({ items: [] });
      });
    });

    describe("update", () => {
      it("changes the name and moves updatedAt", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);

        const updated = await services.orgs.update(
          org.id,
          { name: "Renamed" },
          owner.principal
        );
        expect(updated.name).toBe("Renamed");
        expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(org.updatedAt).getTime()
        );
      });

      it("refuses an unknown org", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        await expect(
          services.orgs.update(
            "00000000-0000-4000-8000-000000000000",
            { name: "X" },
            owner.principal
          )
        ).rejects.toBeInstanceOf(PlatformError);
      });
    });

    describe("delete", () => {
      it("takes the projects and every group in the tree with it", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);
        await makeProject(services, org.id, owner.principal);
        const rootGroup = await groupOf(services, { orgId: org.id });

        await services.orgs.delete(org.id, owner.principal);

        expect(
          await ctx.tenancyDb
            .select()
            .from(project)
            .where(eq(project.orgId, org.id))
        ).toHaveLength(0);
        expect(
          await ctx.authorizationDb
            .select()
            .from(group)
            .where(eq(group.orgId, org.id))
        ).toHaveLength(0);

        // The tuples go too, so nothing is left answering for a group that no
        // longer exists.
        await expect(
          services.checks.can(owner.principal, "admin", rootGroup)
        ).resolves.toBe(false);
      });

      it("refuses an org that is not there", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        await expect(
          services.orgs.delete(
            "00000000-0000-4000-8000-000000000000",
            owner.principal
          )
        ).rejects.toMatchObject({ code: OrgErrors.NOT_FOUND.code });
      });
    });
  }
);
