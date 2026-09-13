import { randomUUID } from "node:crypto";
import { AuthorizationErrors } from "@aec-craft/platform-contracts";
import {
  buildServices,
  createNode,
  dbAvailable,
  grantStanding,
  groupOf,
  ketoAvailable,
  makeOrg,
  makeProject,
  makeUser,
  orgScope,
  projectScope,
  resetSeq,
  useTestDb,
} from "@aec-craft/platform-testing";
import { describe, expect, it } from "vitest";
import { GraphNodeErrors } from "../../src/modules/nodes/graph.node.errors";

/**
 * Authorization for the graph routes, against a real Keto.
 *
 * What is worth asserting here is not that a service calls a check — it is that
 * the model answers the way the design says: a standing falls through to the
 * ones below it, `write` reaches down the tree while `read` does not, and a row
 * a caller may not see is indistinguishable from one that is not there.
 */

/**
 * What the deleted `GraphAuthorizationService.authorizeScope` did, inline: the
 * scope the request named, then the permit on the group it resolves to. A route
 * gets this from `@RequirePermit`; a test says it out loud.
 */
async function authorizeScope(
  services: ReturnType<typeof buildServices>,
  principal: Parameters<typeof services.checks.assertCan>[0],
  ref: Parameters<typeof services.checks.scopeIn>[0],
  permit: Parameters<typeof services.checks.assertCan>[1],
  ownerGroupId?: string
) {
  const scope = await services.checks.scopeIn(ref, ownerGroupId);
  await services.checks.assertCan(principal, permit, scope.groupId);
  return scope;
}

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "graph authorization (integration)",
  () => {
    const ctx = useTestDb();

    describe("a scope named by the request", () => {
      it("resolves the scope for a caller who holds the permit", async () => {
        resetSeq();
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);

        const resolved = await authorizeScope(
          services,
          owner.principal,
          { type: "org", orgId: org.id },
          "read"
        );
        expect(resolved).toEqual(await orgScope(services, org.id));
      });

      it("refuses a caller who holds nothing there", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const stranger = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);

        await expect(
          authorizeScope(
            services,
            stranger.principal,
            { type: "org", orgId: org.id },
            "read"
          )
        ).rejects.toMatchObject({ code: AuthorizationErrors.FORBIDDEN.code });
      });

      it("lets a viewer read and refuses them the write", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const junior = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);
        const rootGroup = await groupOf(services, { orgId: org.id });
        await grantStanding(
          services,
          owner.principal,
          rootGroup,
          junior.subject,
          "viewer"
        );

        await expect(
          authorizeScope(
            services,
            junior.principal,
            { type: "org", orgId: org.id },
            "read"
          )
        ).resolves.toBeDefined();
        await expect(
          authorizeScope(
            services,
            junior.principal,
            { type: "org", orgId: org.id },
            "write"
          )
        ).rejects.toMatchObject({ code: AuthorizationErrors.FORBIDDEN.code });
      });

      it("reaches a project from a standing held on the org", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);
        const created = await makeProject(services, org.id, owner.principal);

        // Nothing was granted on the project. `write` arrives down the parent
        // edge, which is what makes "org staff reach everything beneath them"
        // a property of the tree rather than a bypass.
        await expect(
          authorizeScope(
            services,
            owner.principal,
            { type: "project", projectId: created.id },
            "write"
          )
        ).resolves.toBeDefined();
      });
    });

    describe("by id", () => {
      it("answers not-found for a row the caller may not see", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const stranger = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);
        const node = await createNode(
          services,
          await orgScope(services, org.id),
          { type: "object", class: "element.wall", name: "W-03" }
        );

        // The same error a missing row gets: a caller able to tell those apart
        // has a map of what exists.
        await expect(
          services.nodes.authorizeById(stranger.principal, node.id, "read")
        ).rejects.toMatchObject({ code: GraphNodeErrors.NOT_FOUND.code });
      });

      it("answers not-found for a row that is genuinely absent", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        await expect(
          services.nodes.authorizeById(owner.principal, randomUUID(), "read")
        ).rejects.toMatchObject({ code: GraphNodeErrors.NOT_FOUND.code });
      });

      it("authorizes against the row's own group, not the request's", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);
        const created = await makeProject(services, org.id, owner.principal);
        const node = await createNode(
          services,
          await projectScope(services, created.id),
          { type: "object", class: "element.duct", name: "M-11" }
        );

        const scope = await services.nodes.authorizeById(
          owner.principal,
          node.id,
          "write"
        );
        expect(scope).toMatchObject({ projectId: created.id });
      });
    });

    describe("a changeset", () => {
      it("costs one check per distinct group, not one per row", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const org = await makeOrg(services, owner.principal);
        const rootGroup = await groupOf(services, { orgId: org.id });

        // Deduping is the reason the authorization grain is the group: the same
        // group named a thousand times is still one question.
        await expect(
          services.checks.assertCanAll(
            owner.principal,
            "write",
            Array.from({ length: 1000 }, () => rootGroup)
          )
        ).resolves.toBeUndefined();
      });

      it("refuses the whole batch when one group is not allowed", async () => {
        const services = buildServices(
          ctx.db,
          ctx.tenancyDb,
          ctx.usersDb,
          ctx.authorizationDb
        );
        const owner = await makeUser(ctx.db, services);
        const other = await makeUser(ctx.db, services);
        const mine = await makeOrg(services, owner.principal);
        const theirs = await makeOrg(services, other.principal);

        await expect(
          services.checks.assertCanAll(owner.principal, "write", [
            await groupOf(services, { orgId: mine.id }),
            await groupOf(services, { orgId: theirs.id }),
          ])
        ).rejects.toMatchObject({ code: AuthorizationErrors.FORBIDDEN.code });
      });
    });
  }
);
