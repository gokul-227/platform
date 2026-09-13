import { group } from "@aec-craft/platform-authorization";
import { ProjectErrors } from "@aec-craft/platform-tenancy-api";
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
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "ProjectService (integration)",
  () => {
    const ctx = useTestDb();

    describe("create", () => {
      it("creates the project and its group under the org's root", async () => {
        resetSeq();
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);
        const rootGroup = await groupOf(services, { orgId: org.id });

        const created = await services.projects.create(
          org.id,
          owner.principal,
          {
            name: "Site A",
          }
        );

        const rows = await ctx.authorizationDb
          .select()
          .from(group)
          .where(
            and(eq(group.projectId, created.id), eq(group.type, "project"))
          );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.parentId).toBe(rootGroup);
      });

      it("lets org staff reach the project without a grant of their own", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);
        const created = await makeProject(services, org.id, owner.principal);
        const projectGroup = await groupOf(services, {
          projectId: created.id,
        });

        // `write` arrives down the parent edge, `read` through the roster join
        // the project writes to itself on creation.
        await expect(
          services.checks.permitsOn(owner.principal, projectGroup)
        ).resolves.toMatchObject({ read: true, write: true });
      });

      it("refuses a creator with no standing on the org", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const stranger = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);

        // The service does not check; the route's `@RequirePermit("admin")`
        // does. What is asserted here is the consequence: a stranger holds
        // nothing on the org, so the guard would refuse them.
        const rootGroup = await groupOf(services, { orgId: org.id });
        await expect(
          services.checks.can(stranger.principal, "admin", rootGroup)
        ).resolves.toBe(false);
      });
    });

    describe("list", () => {
      it("returns only projects the caller can read", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const stranger = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);
        const mine = await makeProject(services, org.id, owner.principal);

        await expect(
          services.projects.list(
            {},
            { type: "readableBy", principal: owner.principal }
          )
        ).resolves.toMatchObject({ items: [{ id: mine.id }] });
        await expect(
          services.projects.list(
            {},
            { type: "readableBy", principal: stranger.principal }
          )
        ).resolves.toMatchObject({ items: [] });
      });
    });

    describe("update", () => {
      it("maps a slug collision to PROJECT_SLUG_TAKEN", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);
        const first = await makeProject(services, org.id, owner.principal, {
          slug: "taken",
        });
        const second = await makeProject(services, org.id, owner.principal, {
          slug: "free",
        });

        expect(first.slug).toBe("taken");
        await expect(
          services.projects.update(
            second.id,
            { slug: "taken" },
            owner.principal
          )
        ).rejects.toMatchObject({ code: ProjectErrors.SLUG_TAKEN.code });
      });
    });

    describe("delete", () => {
      it("takes the project's group with it", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);
        const created = await makeProject(services, org.id, owner.principal);

        await services.projects.delete(created.id, owner.principal);

        expect(
          await ctx.authorizationDb
            .select()
            .from(group)
            .where(eq(group.projectId, created.id))
        ).toHaveLength(0);
      });
    });
  }
);
