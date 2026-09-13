import { randomUUID } from "node:crypto";

import type { AuditEventListInput } from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import {
  buildAuditService,
  buildServices,
  dbAvailable,
  groupOf,
  ketoAvailable,
  makeOrg,
  makeProject,
  makeUser,
  recordAuditEvent,
  resetSeq,
  useTestDb,
} from "@aec-craft/platform-testing";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AuditEventErrors } from "../../src/modules/events/audit.event.errors";

/** An id nothing is stored under, for the not-found paths. */
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "AuditService (integration)",
  () => {
    const ctx = useTestDb();

    /**
     * An org with a project inside it. Creating either already writes the log,
     * through the same transaction a request would, so the fixture is also the
     * first thing under test.
     */
    async function fixture() {
      resetSeq();
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);
      return {
        audit: buildAuditService(ctx.auditDb),
        org,
        orgGroup: await groupOf(services, { orgId: org.id }),
        owner,
        project,
        projectGroup: await groupOf(services, { projectId: project.id }),
        services,
      };
    }

    const noFilters = {} as AuditEventListInput;

    /**
     * A row at an exact instant. Pagination assertions need distinct
     * timestamps, and `now()` gives three rows written back to back the same
     * millisecond, which is TODO(#195) rather than the thing under test.
     */
    async function stampRow(fields: {
      createdAt: string;
      groupId: string;
      label: string;
      orgId: string;
      projectId?: string;
    }): Promise<void> {
      await ctx.auditDb.execute(sql`
        insert into audit_event
          (org_id, project_id, group_id, actor_type, resource, resource_id,
           resource_label, verb, created_at)
        values
          (${fields.orgId}, ${fields.projectId ?? null}, ${fields.groupId},
           'user', 'file', ${randomUUID()}, ${fields.label}, 'uploaded',
           ${fields.createdAt}::timestamptz)
      `);
    }

    describe("the org feed", () => {
      it("carries what the directory recorded while the fixture was built", async () => {
        const f = await fixture();
        const page = await f.audit.list(noFilters, { orgId: f.org.id }, [
          f.orgGroup,
          f.projectGroup,
        ]);
        const actions = page.items.map((row) => `${row.resource}.${row.verb}`);
        expect(actions).toContain("org.created");
        expect(actions).toContain("project.created");
        // Newest first, without asking for a sort.
        expect(actions[0]).toBe("project.created");
      });

      it("names the actor as the platform's own user id", async () => {
        const f = await fixture();
        const page = await f.audit.list(noFilters, { orgId: f.org.id }, [
          f.orgGroup,
        ]);
        const created = page.items.find((row) => row.resource === "org");
        expect(created?.actorId).toBe(f.owner.id);
        expect(created?.actorId).not.toBe(f.owner.subject);
        expect(created?.actorType).toBe("user");
      });

      it("leaves out what happened inside a project, and keeps the project itself", async () => {
        const f = await fixture();
        await recordAuditEvent(ctx.auditDb, {
          groupId: f.projectGroup,
          orgId: f.org.id,
          projectId: f.project.id,
          resource: "file",
          verb: "uploaded",
          resourceId: randomUUID(),
          label: "plan.ifc",
          actorId: f.owner.id,
        });

        const orgFeed = await f.audit.list(noFilters, { orgId: f.org.id }, [
          f.orgGroup,
          f.projectGroup,
        ]);
        expect(
          orgFeed.items.map((row) => `${row.resource}.${row.verb}`)
        ).not.toContain("file.uploaded");
        expect(
          orgFeed.items.some((row) => row.resourceId === f.project.id)
        ).toBe(true);

        const projectFeed = await f.audit.list(
          noFilters,
          { projectId: f.project.id },
          [f.projectGroup]
        );
        expect(
          projectFeed.items.map((row) => `${row.resource}.${row.verb}`)
        ).toContain("file.uploaded");
      });

      it("stops at the org it was asked about", async () => {
        const f = await fixture();
        const other = await makeOrg(f.services, f.owner.principal);
        const otherGroup = await groupOf(f.services, { orgId: other.id });

        const page = await f.audit.list(noFilters, { orgId: f.org.id }, [
          f.orgGroup,
          f.projectGroup,
          otherGroup,
        ]);
        expect(page.items.every((row) => row.orgId === f.org.id)).toBe(true);
      });
    });

    describe("the readable-group filter", () => {
      it("hides a row about a group the caller cannot read", async () => {
        const f = await fixture();
        const page = await f.audit.list(
          noFilters,
          { projectId: f.project.id },
          [f.orgGroup]
        );
        expect(page.items).toEqual([]);
      });

      it("shows nothing at all to a caller who reads no group", async () => {
        const f = await fixture();
        const page = await f.audit.list(noFilters, { orgId: f.org.id }, []);
        expect(page.items).toEqual([]);
      });
    });

    describe("filters", () => {
      it("selects one verb, and a set of resources", async () => {
        const f = await fixture();
        const readable = [f.orgGroup, f.projectGroup];

        const created = await f.audit.list(
          { verb: "eq.created" } as AuditEventListInput,
          { orgId: f.org.id },
          readable
        );
        expect(created.items.length).toBeGreaterThan(0);
        expect(created.items.every((row) => row.verb === "created")).toBe(true);

        const deleted = await f.audit.list(
          { verb: "eq.deleted" } as AuditEventListInput,
          { orgId: f.org.id },
          readable
        );
        expect(deleted.items).toEqual([]);

        const both = await f.audit.list(
          { resource: "in.(org,project)" } as AuditEventListInput,
          { orgId: f.org.id },
          readable
        );
        expect(
          both.items.every((row) => ["org", "project"].includes(row.resource))
        ).toBe(true);
      });

      it("searches the recorded label, and matches nothing for a row without one", async () => {
        const f = await fixture();
        await recordAuditEvent(ctx.auditDb, {
          groupId: f.orgGroup,
          orgId: f.org.id,
          resource: "member",
          verb: "added",
          resourceId: randomUUID(),
          label: "Ada Lovelace",
          actorId: f.owner.id,
        });

        const page = await f.audit.list(
          { resourceLabel: "contains.lovelace" } as AuditEventListInput,
          { orgId: f.org.id },
          [f.orgGroup]
        );
        expect(page.items).toHaveLength(1);
        expect(page.items[0]?.resourceLabel).toBe("Ada Lovelace");
      });

      it("selects by actor, and correlates a request through the context bag", async () => {
        const f = await fixture();
        const requestId = randomUUID();
        const stranger = await makeUser(ctx.db, f.services);
        await recordAuditEvent(ctx.auditDb, {
          groupId: f.orgGroup,
          orgId: f.org.id,
          resource: "member",
          verb: "added",
          resourceId: randomUUID(),
          actorId: stranger.id,
          context: { requestId, transport: "http" },
        });

        const mine = await f.audit.list(
          { actorId: `eq.${stranger.id}` } as AuditEventListInput,
          { orgId: f.org.id },
          [f.orgGroup]
        );
        expect(mine.items).toHaveLength(1);

        const correlated = await f.audit.list(
          { "context->requestId": `eq.${requestId}` } as AuditEventListInput,
          { orgId: f.org.id },
          [f.orgGroup]
        );
        expect(correlated.items).toHaveLength(1);
        expect(correlated.items[0]?.context).toMatchObject({
          transport: "http",
        });
      });

      it("bounds the feed by time", async () => {
        const f = await fixture();
        const readable = [f.orgGroup, f.projectGroup];
        const all = await f.audit.list(
          noFilters,
          { orgId: f.org.id },
          readable
        );
        const newest = all.items[0]?.createdAt;
        expect(newest).toBeDefined();

        const since = await f.audit.list(
          { createdAt: `gte.${newest}` } as AuditEventListInput,
          { orgId: f.org.id },
          readable
        );
        expect(since.items).toHaveLength(1);

        const before = await f.audit.list(
          { createdAt: `lt.${newest}` } as AuditEventListInput,
          { orgId: f.org.id },
          readable
        );
        expect(before.items.length).toBe(all.items.length - 1);
      });
    });

    describe("pagination", () => {
      it("walks the log newest-first through the cursor", async () => {
        const f = await fixture();
        for (const [index, name] of ["a.ifc", "b.ifc", "c.ifc"].entries()) {
          await stampRow({
            createdAt: `2099-01-01T00:00:0${index}.000+00`,
            groupId: f.projectGroup,
            label: name,
            orgId: f.org.id,
            projectId: f.project.id,
          });
        }

        const first = await f.audit.list(
          { limit: 2 } as AuditEventListInput,
          { projectId: f.project.id },
          [f.projectGroup]
        );
        expect(first.items.map((row) => row.resourceLabel)).toEqual([
          "c.ifc",
          "b.ifc",
        ]);
        expect(first.nextCursor).not.toBeNull();

        const second = await f.audit.list(
          { limit: 2, cursor: first.nextCursor } as AuditEventListInput,
          { projectId: f.project.id },
          [f.projectGroup]
        );
        // The project's own creation is a row in its feed too, and it is the
        // oldest thing in it.
        expect(second.items.map((row) => row.resourceLabel)).toEqual([
          "a.ifc",
          f.project.name,
        ]);
        expect(second.nextCursor).toBeNull();
      });

      it("counts the whole window for an offset page", async () => {
        const f = await fixture();
        const page = await f.audit.list(
          { page: 1, pageSize: 1 } as AuditEventListInput,
          { orgId: f.org.id },
          [f.orgGroup, f.projectGroup]
        );
        expect(page.items).toHaveLength(1);
        expect(page).toMatchObject({ page: 1, pageSize: 1, total: 2 });
      });

      /**
       * The decode sentinel reaches Postgres inside the keyset comparison, so
       * both halves have to be castable: a non-uuid id or a bound outside the
       * timestamp range is a 500 on a cursor the caller can mistype.
       */
      it("refuses a tampered cursor rather than restarting the feed", async () => {
        const f = await fixture();
        await expect(
          f.audit.list(
            { limit: 5, cursor: "not-a-cursor" } as AuditEventListInput,
            { orgId: f.org.id },
            [f.orgGroup, f.projectGroup]
          )
        ).rejects.toThrow(/cursor/i);
      });

      /**
       * `timestamptz(3)` rounds these three writes onto one millisecond, which
       * is where the page boundary lands: the id tiebreak has to carry all
       * three rather than the feed silently dropping the ones below the
       * truncated bound.
       */
      it("keyset cursor must not skip rows sharing the tail's millisecond", async () => {
        const f = await fixture();
        // Dated ahead of the fixture's own rows, so the page boundary lands
        // inside this millisecond rather than after the newest of them.
        const base = "2099-01-01T00:00:00.500";
        for (const [index, micros] of ["100", "200", "300"].entries()) {
          await ctx.auditDb.execute(sql`
              insert into audit_event
                (org_id, group_id, actor_id, actor_type, resource, resource_id,
                 resource_label, verb, created_at)
              values
                (${f.org.id}, ${f.orgGroup}, ${f.owner.id}, 'user', 'file',
                 ${randomUUID()}, ${`row-${index}`}, 'uploaded',
                 ${`${base}${micros}+00`}::timestamptz)
            `);
        }

        const first = await f.audit.list(
          { limit: 1 } as AuditEventListInput,
          { orgId: f.org.id },
          [f.orgGroup]
        );
        const second = await f.audit.list(
          { limit: 5, cursor: first.nextCursor } as AuditEventListInput,
          { orgId: f.org.id },
          [f.orgGroup]
        );
        const labels = [...first.items, ...second.items]
          .map((row) => row.resourceLabel)
          .filter((label) => label?.startsWith("row-"));
        // Their order within the millisecond is their (random) uuids' business;
        // that each appears exactly once is the property under test.
        expect(labels).toHaveLength(3);
        expect(new Set(labels)).toEqual(new Set(["row-0", "row-1", "row-2"]));
      });
    });

    describe("findById", () => {
      it("returns the event, in the scope that holds it", async () => {
        const f = await fixture();
        const page = await f.audit.list(noFilters, { orgId: f.org.id }, [
          f.orgGroup,
        ]);
        const first = page.items[0];
        expect(first).toBeDefined();

        const found = await f.audit.findById(first?.id ?? "", {
          orgId: f.org.id,
        });
        expect(found.id).toBe(first?.id);
      });

      it("refuses an event from another org, the same way as one that does not exist", async () => {
        const f = await fixture();
        const other = await makeOrg(f.services, f.owner.principal);
        const page = await f.audit.list(noFilters, { orgId: f.org.id }, [
          f.orgGroup,
        ]);
        const id = page.items[0]?.id ?? "";

        await expect(f.audit.findById(id, { orgId: other.id })).rejects.toThrow(
          PlatformError
        );
        await expect(
          f.audit.findById(MISSING_ID, { orgId: f.org.id })
        ).rejects.toMatchObject({ code: AuditEventErrors.NOT_FOUND.code });
      });
    });
  }
);
