import { AuthorizationErrors } from "@aec-craft/platform-contracts";
import { MemberErrors } from "@aec-craft/platform-tenancy-api";
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
  type Services,
  useTestDb,
} from "@aec-craft/platform-testing";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Changing what somebody holds, and the three rules that decide whether it is
 * allowed to happen.
 *
 * Two of them only ever applied to taking a standing away, and a demotion is a
 * removal spelled as an update: the first cost an org its only owner,
 * unrecoverably through the product, and the second let a manager unseat one.
 * The third is that nobody administers their own standing at all, which is the
 * rest of the first argument rather than a separate one.
 */
describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "changing a member's standing",
  () => {
    const ctx = useTestDb();

    let services: Services;
    let world: {
      groupId: string;
      manager: Awaited<ReturnType<typeof makeUser>>;
      orgId: string;
      owner: Awaited<ReturnType<typeof makeUser>>;
      projectGroup: string;
      projectGroupProject: string;
      viewer: Awaited<ReturnType<typeof makeUser>>;
    };

    beforeEach(async () => {
      resetSeq();
      services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );

      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const groupId = await groupOf(services, { orgId: org.id });
      const project = await makeProject(services, org.id, owner.principal);
      const projectGroup = await groupOf(services, { projectId: project.id });

      const [manager, viewer] = await Promise.all([
        makeUser(ctx.db, services),
        makeUser(ctx.db, services),
      ]);
      await grantStanding(
        services,
        owner.principal,
        groupId,
        manager.principal.subject,
        "manager"
      );
      await grantStanding(
        services,
        owner.principal,
        groupId,
        viewer.principal.subject,
        "viewer"
      );

      world = {
        groupId,
        manager,
        orgId: org.id,
        owner,
        projectGroup,
        projectGroupProject: project.id,
        viewer,
      };
    });

    it("releases a project's only direct owner, because the org owns it too", async () => {
      // The failure this replaces: the guard counted the tuples written on the
      // project and found one owner, so the person who granted it could not
      // take it back. `own` traverses the parent, so the org's owner owns this
      // project without standing in it and it was never in danger.
      await grantStanding(
        services,
        world.owner.principal,
        world.projectGroup,
        world.viewer.principal.subject,
        "owner"
      );

      await services.members.setStanding(
        world.owner.principal,
        world.projectGroup,
        world.viewer.principal.subject,
        "editor"
      );
      expect(
        (await services.checks.subjectsIn(world.projectGroup)).find(
          (m) => m.subject === world.viewer.principal.subject
        )?.standing
      ).toBe("editor");

      // And the removal path agrees with the demotion path, which is the whole
      // reason the two share an invariant.
      await grantStanding(
        services,
        world.owner.principal,
        world.projectGroup,
        world.viewer.principal.subject,
        "owner"
      );
      await services.members.remove(
        world.owner.principal,
        world.projectGroup,
        world.viewer.principal.subject
      );
      expect(
        (await services.checks.subjectsIn(world.projectGroup)).find(
          (m) => m.subject === world.viewer.principal.subject
        )
      ).toBeUndefined();
    });

    it("lists who reaches a project, not only who was added to it", async () => {
      const editor = await makeUser(ctx.db, services);
      await grantStanding(
        services,
        world.owner.principal,
        world.projectGroup,
        editor.principal.subject,
        "editor"
      );

      const members = await services.members.list(world.projectGroup);
      const rows = new Map(members.items.map((m) => [m.subject, m]));

      // Added here, so this is where it is changed.
      expect(rows.get(editor.principal.subject)).toMatchObject({
        standing: "editor",
        source: "direct",
      });

      // The org's owner administers this project and has no tuple on it. The
      // list used to omit them, which is what made a project with one member
      // look like a project with one owner.
      expect(rows.get(world.owner.principal.subject)).toMatchObject({
        standing: "owner",
        source: "inherited",
      });

      // The org's manager reaches down too, at the standing they hold above.
      expect(rows.get(world.manager.principal.subject)).toMatchObject({
        standing: "manager",
        source: "inherited",
      });

      // And the org's viewer, who reaches a project only because it was created
      // joined to the org's roster. Listed because they can open it, which is
      // the question the roster answers.
      expect(rows.get(world.viewer.principal.subject)).toMatchObject({
        standing: "viewer",
        source: "inherited",
      });
      await expect(
        services.checks.can(world.viewer.principal, "read", world.projectGroup)
      ).resolves.toBe(true);
    });

    it("shows the stronger standing when somebody holds both", async () => {
      // A direct viewer on the project who owns the org is an owner of the
      // project, and rendering the tuple written here would understate what
      // they can do.
      await grantStanding(
        services,
        world.owner.principal,
        world.projectGroup,
        world.manager.principal.subject,
        "viewer"
      );

      const members = await services.members.list(world.projectGroup);
      expect(
        members.items.find((m) => m.subject === world.manager.principal.subject)
      ).toMatchObject({ standing: "manager", source: "inherited" });
    });

    it("refuses to remove somebody who only reaches the project from above", async () => {
      // Their standing is not held here, so there is nothing on this group to
      // take away. Told as a missing member rather than a refusal, because the
      // caller named a row that does not exist.
      const remove = services.members.remove(
        world.owner.principal,
        world.projectGroup,
        world.manager.principal.subject
      );
      await expect(remove).rejects.toMatchObject({
        code: MemberErrors.NOT_FOUND.code,
      });
    });

    it("counts a sole ownership only where nothing above can own it", async () => {
      // What blocks deleting a person. Owning a project alone is recoverable by
      // whoever owns the org, so it is not a handover the tenant has to make
      // first; owning the org alone is the one that is.
      await grantStanding(
        services,
        world.owner.principal,
        world.projectGroup,
        world.viewer.principal.subject,
        "owner"
      );

      await expect(
        services.checks.soleOwnerships(world.viewer.principal.subject)
      ).resolves.toEqual([]);

      const blocking = await services.checks.soleOwnerships(
        world.owner.principal.subject
      );
      expect(blocking.map((row) => row.id)).toEqual([world.groupId]);
    });

    it("refuses a self change even once a second owner exists", async () => {
      await grantStanding(
        services,
        world.owner.principal,
        world.groupId,
        world.viewer.principal.subject,
        "owner"
      );

      // Not the last-owner rule any more: nobody changes their own standing,
      // because the reach that would undo it is the reach they gave up.
      await expect(
        services.members.setStanding(
          world.owner.principal,
          world.groupId,
          world.owner.principal.subject,
          "editor"
        )
      ).rejects.toMatchObject({ code: MemberErrors.SELF.code });
      await expect(
        services.members.remove(
          world.owner.principal,
          world.groupId,
          world.owner.principal.subject
        )
      ).rejects.toMatchObject({ code: MemberErrors.SELF.code });
    });

    it("lets the second owner step the first one down", async () => {
      await grantStanding(
        services,
        world.owner.principal,
        world.groupId,
        world.viewer.principal.subject,
        "owner"
      );
      await services.members.setStanding(
        world.viewer.principal,
        world.groupId,
        world.owner.principal.subject,
        "editor"
      );

      const members = await services.checks.subjectsIn(world.groupId);
      expect(
        members.find((m) => m.subject === world.owner.principal.subject)
          ?.standing
      ).toBe("editor");
      expect(members.filter((m) => m.standing === "owner")).toHaveLength(1);
    });

    it("lists readable groups from a project alone, with no org named", async () => {
      // The project-scoped audit route knows only its project id. It used to
      // pass "" for the org, which reaches a uuid column as `org_id = ''` and
      // fails the request with a Postgres syntax error rather than narrowing.
      const readable = await services.checks.readableGroups(
        world.owner.principal,
        { projectId: world.projectGroupProject }
      );
      expect(readable).toContain(world.projectGroup);

      // Neither id named is an empty answer, not a query over every group.
      await expect(
        services.checks.readableGroups(world.owner.principal, {})
      ).resolves.toEqual([]);
    });

    it("gives an admin everything inside the tenant but not the tenant", async () => {
      const lead = await makeUser(ctx.db, services);
      await grantStanding(
        services,
        world.owner.principal,
        world.groupId,
        lead.principal.subject,
        "admin"
      );

      const permits = await services.checks.permitsOn(
        lead.principal,
        world.groupId
      );
      expect(permits).toEqual({
        read: true,
        write: true,
        manage: true,
        admin: true,
        own: false,
      });

      // An absent owner is the case the tier exists for, so an admin has to be
      // able to appoint another one without them.
      await services.members.setStanding(
        lead.principal,
        world.groupId,
        world.viewer.principal.subject,
        "admin"
      );
      expect(
        (await services.checks.subjectsIn(world.groupId)).find(
          (m) => m.subject === world.viewer.principal.subject
        )?.standing
      ).toBe("admin");

      // But never an owner: that is the one rung they cannot reach.
      await expect(
        services.members.setStanding(
          lead.principal,
          world.groupId,
          world.manager.principal.subject,
          "owner"
        )
      ).rejects.toMatchObject({
        code: AuthorizationErrors.ESCALATION_REFUSED.code,
      });
    });

    it("refuses a manager demoting an owner, which the removal path already refused", async () => {
      const demote = services.members.setStanding(
        world.manager.principal,
        world.groupId,
        world.owner.principal.subject,
        "viewer"
      );
      await expect(demote).rejects.toMatchObject({
        code: AuthorizationErrors.ESCALATION_REFUSED.code,
      });
    });

    it("lets a manager change someone standing below them", async () => {
      await services.members.setStanding(
        world.manager.principal,
        world.groupId,
        world.viewer.principal.subject,
        "editor"
      );
      const members = await services.checks.subjectsIn(world.groupId);
      expect(
        members.find((m) => m.subject === world.viewer.principal.subject)
          ?.standing
      ).toBe("editor");
    });

    it("resolves a person by the email the directory knows them by", async () => {
      const newcomer = await makeUser(ctx.db, services);
      await services.members.add(world.owner.principal, world.groupId, {
        // Mixed case on purpose: somebody types their own address however
        // they please, and the match is against what the provider stored.
        email: newcomer.email.toUpperCase(),
        standing: "editor",
      });

      const members = await services.checks.subjectsIn(world.groupId);
      expect(
        members.find((m) => m.subject === newcomer.principal.subject)?.standing
      ).toBe("editor");
    });

    it("refuses an address nobody has signed in with", async () => {
      const add = services.members.add(world.owner.principal, world.groupId, {
        email: "nobody@example.test",
        standing: "viewer",
      });
      await expect(add).rejects.toMatchObject({
        code: MemberErrors.EMAIL_UNKNOWN.code,
      });
    });
  }
);
