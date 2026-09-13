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
  type Services,
  useTestDb,
} from "@aec-craft/platform-testing";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The authorization model as a table, against a real Keto.
 *
 * The individual services each test that they call a check. What none of them
 * can test is whether the model answers correctly once a realistic org is
 * standing up: several people at different standings, two tenants that must not
 * see each other, and a row that belongs to one of them. That is a property of
 * the whole arrangement, so it is asserted here once rather than inferred from
 * parts.
 *
 *   Marius   org owner       administers everything, writes everything
 *   Lena     org viewer      reads everything, writes nothing
 *   Vogel    project manager runs one project, writes it, holds nothing above
 *   Bauer    project viewer  reads the project, writes nothing
 *   Nord     another org     sees none of it
 */
describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "the authorization model, end to end",
  () => {
    const ctx = useTestDb();

    /**
     * One org with one project, plus an outsider who shares nothing with it.
     *
     * Rebuilt per test rather than once: the suite truncates between tests, so
     * a world built in `beforeAll` is gone by the first assertion. Keto keeps its
     * tuples, but every id here is fresh, so nothing carries over.
     */
    let services: Services;
    let world: {
      bauer: Awaited<ReturnType<typeof makeUser>>;
      lena: Awaited<ReturnType<typeof makeUser>>;
      marius: Awaited<ReturnType<typeof makeUser>>;
      nord: Awaited<ReturnType<typeof makeUser>>;
      orgGroup: string;
      orgId: string;
      projectGroup: string;
      projectId: string;
      vogel: Awaited<ReturnType<typeof makeUser>>;
    };

    beforeEach(async () => {
      resetSeq();
      services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );

      const marius = await makeUser(ctx.db, services);
      const org = await makeOrg(services, marius.principal);
      const project = await makeProject(services, org.id, marius.principal);

      const orgGroup = await groupOf(services, { orgId: org.id });
      const projectGroup = await groupOf(services, {
        projectId: project.id,
      });

      const [lena, vogel, bauer, nord] = await Promise.all([
        makeUser(ctx.db, services),
        makeUser(ctx.db, services),
        makeUser(ctx.db, services),
        makeUser(ctx.db, services),
      ]);

      await grantStanding(
        services,
        marius.principal,
        orgGroup,
        lena.principal.subject,
        "viewer"
      );
      await grantStanding(
        services,
        marius.principal,
        projectGroup,
        vogel.principal.subject,
        "manager"
      );
      await grantStanding(
        services,
        marius.principal,
        projectGroup,
        bauer.principal.subject,
        "viewer"
      );

      world = {
        bauer,
        lena,
        marius,
        nord,
        orgGroup,
        orgId: org.id,
        projectGroup,
        projectId: project.id,
        vogel,
      };
    });

    /** `can` rather than `assertCan`: a table wants booleans, not throws. */
    const may = (
      who: keyof typeof world,
      permit: "read" | "write" | "manage" | "admin",
      group: "orgGroup" | "projectGroup"
    ): Promise<boolean> =>
      services.checks.can(
        (world[who] as { principal: { subject: string } }).principal as never,
        permit,
        world[group] as string
      );

    describe("standing falls through to the ones below it", () => {
      it("an owner holds every permit without a tuple for each", async () => {
        expect(await may("marius", "admin", "orgGroup")).toBe(true);
        expect(await may("marius", "manage", "orgGroup")).toBe(true);
        expect(await may("marius", "write", "orgGroup")).toBe(true);
        expect(await may("marius", "read", "orgGroup")).toBe(true);
      });

      it("a viewer holds read and nothing above it", async () => {
        expect(await may("lena", "read", "orgGroup")).toBe(true);
        expect(await may("lena", "write", "orgGroup")).toBe(false);
        expect(await may("lena", "manage", "orgGroup")).toBe(false);
        expect(await may("lena", "admin", "orgGroup")).toBe(false);
      });
    });

    describe("position is reach, standing is what you hold", () => {
      it("an owner above reaches down into the project", async () => {
        expect(await may("marius", "admin", "projectGroup")).toBe(true);
        expect(await may("marius", "write", "projectGroup")).toBe(true);
        expect(await may("marius", "read", "projectGroup")).toBe(true);
      });

      it("nobody can write what they cannot read", async () => {
        // The permits are spelled as unions of relations rather than as a
        // ladder of calls into each other. Written as a ladder, each rung costs
        // a level of Keto's expansion budget and the reach of the permits comes
        // apart, producing an owner who can administer what they cannot read.
        for (const who of ["marius", "vogel", "lena", "bauer"] as const) {
          if (await may(who, "write", "projectGroup")) {
            expect(await may(who, "read", "projectGroup")).toBe(true);
          }
        }
      });

      it("a junior above reaches nothing, which is the case standing exists for", async () => {
        // Lena sits at org level and still cannot write a single row of the
        // project: traversal carries the standing she holds, and hers is viewer.
        expect(await may("lena", "read", "projectGroup")).toBe(true);
        expect(await may("lena", "write", "projectGroup")).toBe(false);
      });

      it("nothing reaches upward", async () => {
        // Vogel runs the project and holds nothing over the tenant that owns
        // it. A parent edge points one way and is never followed backwards.
        expect(await may("vogel", "manage", "projectGroup")).toBe(true);
        expect(await may("vogel", "write", "projectGroup")).toBe(true);
        expect(await may("vogel", "admin", "projectGroup")).toBe(false);
        expect(await may("vogel", "read", "orgGroup")).toBe(false);
        expect(await may("vogel", "write", "orgGroup")).toBe(false);
      });

      it("a member of one tenant holds nothing in another", async () => {
        for (const group of ["orgGroup", "projectGroup"] as const) {
          expect(await may("nord", "read", group)).toBe(false);
          expect(await may("nord", "write", group)).toBe(false);
        }
      });
    });

    describe("the tree has room to grow", () => {
      it("an owner reads a group nested well below anything the product builds", async () => {
        // Written straight to Keto, because nothing creates a third level yet:
        // the guard is on the model and its expansion budget, not on a feature.
        //
        // A check that exhausts `limit.max_read_depth` is answered as a denial
        // rather than an error, so outgrowing it looks like an empty page with
        // nothing in the logs. If this fails, raise the limit in buildOS ID's
        // `ory/keto/keto.yml` and take the release of
        // `@aec-craft/platform-id-permissions` that carries it.
        const write = process.env.KETO_WRITE_URL ?? "http://localhost:4467";
        // Derived from this test's own org, not fixed: Keto keeps its tuples
        // between runs, and a constant object id accumulates one owner tuple
        // per run until the deep check times out rather than answering.
        const stem = world.orgId.slice(0, 28);
        const chain = Array.from(
          { length: 6 },
          (_unused, level) => `${stem}dep${level}`
        );
        const put = (body: unknown) =>
          fetch(`${write}/admin/relation-tuples`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });

        await put({
          namespace: "Group",
          object: chain[0],
          relation: "owners",
          subject_id: world.marius.principal.subject,
        });
        for (let level = 1; level < chain.length; level += 1) {
          await put({
            namespace: "Group",
            object: chain[level],
            relation: "parent",
            subject_set: {
              namespace: "Group",
              object: chain[level - 1],
              relation: "",
            },
          });
        }

        const deepest = chain.at(-1) as string;
        for (const permit of ["read", "write", "manage", "admin"] as const) {
          expect(
            await services.checks.can(world.marius.principal, permit, deepest)
          ).toBe(true);
        }
      });
    });

    describe("the checks the write path runs", () => {
      it("refuses a standing at or above the granter's own", async () => {
        // Vogel manages the project, so he hands out editor and viewer and
        // never another manager: the administration chain deepens only from
        // above it.
        await expect(
          grantStanding(
            services,
            world.vogel.principal,
            world.projectGroup,
            world.bauer.principal.subject,
            "manager"
          )
        ).rejects.toMatchObject({
          code: AuthorizationErrors.ESCALATION_REFUSED.code,
        });
      });

      it("lets an owner appoint a peer", async () => {
        await expect(
          grantStanding(
            services,
            world.marius.principal,
            world.projectGroup,
            world.nord.principal.subject,
            "owner"
          )
        ).resolves.not.toThrow();
      });
    });

    describe("resources answer to their own group", () => {
      it("a row in the project is writable by the project's staff", async () => {
        const scope = await projectScope(services, world.projectId);
        await expect(
          createNode(services, scope, {
            class: "space",
            name: "Operating room",
            type: "object",
          })
        ).resolves.toBeDefined();
      });

      it("a row a caller may not see is indistinguishable from one that is not there", async () => {
        const scope = await orgScope(services, world.orgId);
        const node = await createNode(services, scope, {
          class: "space",
          name: "Plant room",
          type: "object",
        });

        // Through the authorization entry point, not the service: `findById`
        // takes an already-resolved scope, so the check that matters happens
        // before it. Not a 403 either — telling a stranger that a row exists is
        // itself the disclosure.
        await expect(
          services.nodes.authorizeById(world.nord.principal, node.id, "read")
        ).rejects.toMatchObject({
          // The literal wire code, not the constant: importing graph-api here would
          // cycle, and a test that pins the string is the stronger assertion anyway.
          code: "GRAPH_NODE_NOT_FOUND",
        });
      });
    });
  }
);
