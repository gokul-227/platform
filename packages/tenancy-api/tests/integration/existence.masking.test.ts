import { randomUUID } from "node:crypto";
import { AuthorizationErrors } from "@aec-craft/platform-contracts";
import { OrgErrors } from "@aec-craft/platform-tenancy-api";
import {
  buildServices,
  dbAvailable,
  grantStanding,
  groupOf,
  ketoAvailable,
  makeOrg,
  makeProject,
  makeUser,
  resetSeq,
  useTestDb,
} from "@aec-craft/platform-testing";
import { describe, expect, it } from "vitest";

/**
 * A refusal must not answer a question the caller was not entitled to ask.
 *
 * Refusing a real organization with 403 and an invented one with 404 turns any
 * endpoint into an oracle for which ids exist, and existence is customer data:
 * which projects a tenant runs is worth knowing to someone who should not know
 * it.
 *
 * The mask is conditional, and the second half of this suite is why. A caller
 * who already holds `read` knows the thing exists, so answering 404 on a write
 * would be a lie that costs them a debugging session and protects nothing.
 */
describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "existence is not observable (integration)",
  () => {
    const ctx = useTestDb();

    it("gives an outsider the same answer for a real and an invented org", async () => {
      resetSeq();
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const outsider = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);

      const real = await services.checks
        .assertCanOrMask(
          outsider.principal,
          "read",
          await groupOf(services, { orgId: org.id }),
          OrgErrors.NOT_FOUND
        )
        .catch((error: { code: string }) => error.code);
      expect(real).toBe(OrgErrors.NOT_FOUND.code);

      // The invented one cannot even resolve a group, and has to land on
      // the same code by a different route.
      const invented = await services.checks
        .resolveGroup({ type: "org", orgId: randomUUID() })
        .catch((error: { code: string }) => error.code);
      expect(invented).toBe(OrgErrors.NOT_FOUND.code);
    });

    it("masks a write an outsider cannot make, rather than refusing it", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const outsider = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);

      await expect(
        services.checks.assertCanOrMask(
          outsider.principal,
          "manage",
          await groupOf(services, { orgId: org.id }),
          OrgErrors.NOT_FOUND
        )
      ).rejects.toMatchObject({ code: OrgErrors.NOT_FOUND.code });
    });

    it("refuses a reader's write honestly, because they can see it already", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const reader = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const root = await groupOf(services, { orgId: org.id });
      await grantStanding(
        services,
        owner.principal,
        root,
        reader.subject,
        "viewer"
      );

      await expect(
        services.checks.assertCanOrMask(
          reader.principal,
          "read",
          root,
          OrgErrors.NOT_FOUND
        )
      ).resolves.toBeUndefined();
      await expect(
        services.checks.assertCanOrMask(
          reader.principal,
          "manage",
          root,
          OrgErrors.NOT_FOUND
        )
      ).rejects.toMatchObject({ code: AuthorizationErrors.FORBIDDEN.code });
    });

    it("hides a project the caller has no standing on", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const outsider = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const created = await makeProject(services, org.id, owner.principal);

      await expect(
        services.checks.assertCanOrMask(
          outsider.principal,
          "read",
          await groupOf(services, { projectId: created.id }),
          OrgErrors.NOT_FOUND
        )
      ).rejects.toMatchObject({ code: OrgErrors.NOT_FOUND.code });
    });
  }
);
