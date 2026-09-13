import type { ResolvedScope } from "@aec-craft/platform-contracts";
import {
  buildServices,
  buildThreadServices,
  dbAvailable,
  makeOrg,
  makeProject,
  makeThread,
  makeUser,
  orgScope,
  projectScope,
  resetSeq,
  type Services,
  type TestUser,
  type ThreadServices,
  useTestDb,
} from "@aec-craft/platform-testing";
import { thread } from "@aec-craft/platform-threads-api";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ThreadErrors } from "../../src/modules/thread.errors";

/**
 * `ThreadService` against real Postgres. Documents the v1 contract: threads are
 * owner-private, org and project scope are exclusive (never nested), and the
 * service re-applies scope + ownership even though the guard already did.
 */
describe.skipIf(!dbAvailable())("ThreadService (integration)", () => {
  const ctx = useTestDb();

  /**
   * Pin `updated_at` so ordering/keyset expectations don't ride on insert
   * timing — consecutive inserts can land inside one millisecond, which the
   * ms-truncating cursor cannot keep apart.
   */
  async function pinUpdatedAt(id: string, updatedAt: string): Promise<void> {
    await ctx.pool.query("UPDATE thread SET updated_at = $1 WHERE id = $2", [
      updatedAt,
      id,
    ]);
  }

  interface Seed {
    org: { id: string };
    orgScope: ResolvedScope;
    owner: TestUser;
    project: { id: string };
    projectScope: ResolvedScope;
    services: Services;
    threads: ThreadServices;
  }

  async function seed(): Promise<Seed> {
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
      services,
      threads: buildThreadServices(ctx.threadsDb),
      owner,
      org,
      orgScope: await orgScope(services, org.id),
      project,
      projectScope: await projectScope(services, project.id),
    };
  }

  describe("create", () => {
    it("creates an org-scoped thread stamped with the owner", async () => {
      const s = await seed();
      const created = await s.threads.threads.create(
        s.orgScope,
        { title: "Erdgeschoss Fragen" },
        s.owner.subject
      );

      expect(created.orgId).toBe(s.org.id);
      expect(created.projectId).toBeNull();
      expect(created.subject).toBe(s.owner.subject);
      expect(created.title).toBe("Erdgeschoss Fragen");
      expect(created.metadata).toEqual({});
      // TODO(#110): clientId is declared in the contract but never stamped
      expect(created.clientId).toBeNull();
    });

    it("creates a project-scoped thread carrying the parent org", async () => {
      const s = await seed();
      const created = await s.threads.threads.create(
        s.projectScope,
        { metadata: { source: "test" } },
        s.owner.subject
      );

      expect(created.orgId).toBe(s.org.id);
      expect(created.projectId).toBe(s.project.id);
      expect(created.title).toBeNull();
      expect(created.metadata).toEqual({ source: "test" });
    });
  });

  describe("findById", () => {
    it("returns the owner's thread within its scope", async () => {
      const s = await seed();
      const created = await makeThread(
        s.threads.threads,
        s.orgScope,
        s.owner.subject
      );

      const found = await s.threads.threads.findById(
        s.orgScope,
        s.owner.subject,
        created.id
      );
      expect(found.id).toBe(created.id);
    });

    it("masks another user's thread as NOT_FOUND (never FORBIDDEN)", async () => {
      const s = await seed();
      const stranger = await makeUser(ctx.db, s.services);
      const created = await makeThread(
        s.threads.threads,
        s.orgScope,
        s.owner.subject
      );

      await expect(
        s.threads.threads.findById(s.orgScope, stranger.subject, created.id)
      ).rejects.toMatchObject({ code: ThreadErrors.NOT_FOUND.code });
    });

    it("does not resolve a project thread through org scope", async () => {
      const s = await seed();
      const created = await makeThread(
        s.threads.threads,
        s.projectScope,
        s.owner.subject
      );

      await expect(
        s.threads.threads.findById(s.orgScope, s.owner.subject, created.id)
      ).rejects.toMatchObject({ code: ThreadErrors.NOT_FOUND.code });
    });
  });

  describe("list (org XOR project scoping)", () => {
    it("org scope lists only org-scoped threads; project scope only the project's", async () => {
      const s = await seed();
      const orgThread = await makeThread(
        s.threads.threads,
        s.orgScope,
        s.owner.subject
      );
      const projectThread = await makeThread(
        s.threads.threads,
        s.projectScope,
        s.owner.subject
      );

      const orgList = await s.threads.threads.list(
        s.orgScope,
        s.owner.subject,
        {}
      );
      expect(orgList.items.map((t) => t.id)).toEqual([orgThread.id]);

      const projectList = await s.threads.threads.list(
        s.projectScope,
        s.owner.subject,
        {}
      );
      expect(projectList.items.map((t) => t.id)).toEqual([projectThread.id]);
    });

    it("returns only the caller's own threads", async () => {
      const s = await seed();
      const other = await makeUser(ctx.db, s.services);
      const own = await makeThread(
        s.threads.threads,
        s.orgScope,
        s.owner.subject
      );
      await makeThread(s.threads.threads, s.orgScope, other.subject);

      const list = await s.threads.threads.list(
        s.orgScope,
        s.owner.subject,
        {}
      );
      expect(list.items.map((t) => t.id)).toEqual([own.id]);
    });

    it("orders most-recently-updated first and paginates by keyset cursor", async () => {
      const s = await seed();
      const scope = s.orgScope;
      const first = await makeThread(s.threads.threads, scope, s.owner.subject);
      const second = await makeThread(
        s.threads.threads,
        scope,
        s.owner.subject
      );
      const third = await makeThread(s.threads.threads, scope, s.owner.subject);
      // Millisecond-aligned instants survive the cursor's ISO-8601 round-trip
      // exactly (the sub-ms case is the documented bug below).
      await pinUpdatedAt(first.id, "2026-01-01 10:00:00.100+00");
      await pinUpdatedAt(second.id, "2026-01-01 10:00:00.200+00");
      await pinUpdatedAt(third.id, "2026-01-01 10:00:00.300+00");

      const pageOne = await s.threads.threads.list(scope, s.owner.subject, {
        limit: 2,
      });
      expect(pageOne.items.map((t) => t.id)).toEqual([third.id, second.id]);
      expect(pageOne.nextCursor).not.toBeNull();

      const pageTwo = await s.threads.threads.list(scope, s.owner.subject, {
        limit: 2,
        cursor: pageOne.nextCursor as string,
      });
      expect(pageTwo.items.map((t) => t.id)).toEqual([first.id]);
      expect(pageTwo.nextCursor).toBeNull();
    });

    it("drops a thread touched mid-scroll from the scroll rather than repeating it", async () => {
      const s = await seed();
      const scope = s.orgScope;
      const first = await makeThread(s.threads.threads, scope, s.owner.subject);
      const second = await makeThread(
        s.threads.threads,
        scope,
        s.owner.subject
      );
      const third = await makeThread(s.threads.threads, scope, s.owner.subject);
      await pinUpdatedAt(first.id, "2026-01-01 10:00:00.100+00");
      await pinUpdatedAt(second.id, "2026-01-01 10:00:00.200+00");
      await pinUpdatedAt(third.id, "2026-01-01 10:00:00.300+00");

      const pageOne = await s.threads.threads.list(scope, s.owner.subject, {
        limit: 2,
      });
      expect(pageOne.items.map((t) => t.id)).toEqual([third.id, second.id]);

      // `first` was page two's only row. A message on it bumps `updatedAt`
      // above the cursor, which is the half of the list already served.
      await pinUpdatedAt(first.id, "2026-01-01 10:00:00.400+00");

      const pageTwo = await s.threads.threads.list(scope, s.owner.subject, {
        limit: 2,
        cursor: pageOne.nextCursor as string,
      });
      expect(pageTwo.items).toEqual([]);

      // Absent from the scroll, and at the head of the next one: the keyset is
      // sound over a mutable column only in this direction.
      const refetched = await s.threads.threads.list(scope, s.owner.subject, {
        limit: 2,
      });
      expect(refetched.items.map((t) => t.id)).toEqual([first.id, third.id]);
    });

    it("keyset cursor must not skip rows sharing the tail's millisecond", async () => {
      const s = await seed();
      const scope = s.orgScope;
      const first = await makeThread(s.threads.threads, scope, s.owner.subject);
      const second = await makeThread(
        s.threads.threads,
        scope,
        s.owner.subject
      );
      const third = await makeThread(s.threads.threads, scope, s.owner.subject);
      // Sub-millisecond fractions, which `timestamptz(3)` rounds on the way
      // in: `first` and `second` end up on the same millisecond, so the page
      // boundary falls inside it and the id tiebreak has to carry the pair.
      await pinUpdatedAt(first.id, "2026-01-01 10:00:00.001100+00");
      await pinUpdatedAt(second.id, "2026-01-01 10:00:00.001200+00");
      await pinUpdatedAt(third.id, "2026-01-01 10:00:00.002+00");

      const pageOne = await s.threads.threads.list(scope, s.owner.subject, {
        limit: 2,
      });
      expect(pageOne.items[0]?.id).toBe(third.id);
      expect(pageOne.items).toHaveLength(2);

      const pageTwo = await s.threads.threads.list(scope, s.owner.subject, {
        limit: 2,
        cursor: pageOne.nextCursor as string,
      });
      // Neither of the tied pair is skipped and neither is served twice; which
      // one lands on which page is its (random) uuid's business.
      expect(pageTwo.items).toHaveLength(1);
      expect(
        new Set([...pageOne.items, ...pageTwo.items].map((t) => t.id))
      ).toEqual(new Set([first.id, second.id, third.id]));
    });
  });

  describe("update", () => {
    it("renames and retags; updatedAt advances", async () => {
      const s = await seed();
      const created = await makeThread(
        s.threads.threads,
        s.orgScope,
        s.owner.subject
      );
      // Freeze the baseline: the bump uses the JS clock while the insert used
      // DB `now()` — live timestamps could tie inside one millisecond.
      const baseline = "2026-01-01T10:00:00.000Z";
      await pinUpdatedAt(created.id, baseline);

      const updated = await s.threads.threads.update(
        s.orgScope,
        s.owner.subject,
        created.id,
        { title: "Umbenannt" }
      );
      expect(updated.title).toBe("Umbenannt");
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(baseline).getTime()
      );
    });

    it("rejects a non-owner with NOT_FOUND", async () => {
      const s = await seed();
      const stranger = await makeUser(ctx.db, s.services);
      const created = await makeThread(
        s.threads.threads,
        s.orgScope,
        s.owner.subject
      );

      await expect(
        s.threads.threads.update(s.orgScope, stranger.subject, created.id, {
          title: "Hijack",
        })
      ).rejects.toMatchObject({ code: ThreadErrors.NOT_FOUND.code });
    });
  });

  describe("delete", () => {
    it("deletes the thread and cascades messages and runs", async () => {
      const s = await seed();
      const created = await makeThread(
        s.threads.threads,
        s.orgScope,
        s.owner.subject
      );
      await s.threads.messages.create(created.id, {
        role: "user",
        content: "Hallo",
      });
      const run = await s.threads.runs.create(
        created.id,
        s.owner.subject,
        null,
        null
      );

      await s.threads.threads.delete(s.orgScope, s.owner.subject, created.id);

      const rows = await ctx.threadsDb
        .select()
        .from(thread)
        .where(eq(thread.id, created.id));
      expect(rows).toHaveLength(0);
      const messages = await s.threads.messages.list(created.id, {});
      expect(messages.items).toHaveLength(0);
      await expect(
        s.threads.runs.findById(created.id, run.id)
      ).rejects.toMatchObject({ code: ThreadErrors.RUN_NOT_FOUND.code });
    });

    it("rejects a non-owner with NOT_FOUND and keeps the thread", async () => {
      const s = await seed();
      const stranger = await makeUser(ctx.db, s.services);
      const created = await makeThread(
        s.threads.threads,
        s.orgScope,
        s.owner.subject
      );

      await expect(
        s.threads.threads.delete(s.orgScope, stranger.subject, created.id)
      ).rejects.toMatchObject({ code: ThreadErrors.NOT_FOUND.code });
      const still = await s.threads.threads.findById(
        s.orgScope,
        s.owner.subject,
        created.id
      );
      expect(still.id).toBe(created.id);
    });
  });
});
