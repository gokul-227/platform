import type { ResolvedScope } from "@aec-craft/platform-contracts";
import {
  buildServices,
  buildThreadServices,
  dbAvailable,
  makeOrg,
  makeThread,
  makeUser,
  orgScope,
  resetSeq,
  type TestUser,
  type ThreadServices,
  useTestDb,
} from "@aec-craft/platform-testing";
import { describe, expect, it } from "vitest";
import { ThreadErrors } from "../../src/modules/thread.errors";

/**
 * The thread + run metadata KV sub-resources against real Postgres. Both bind
 * `MetadataStore`, so what is worth asserting here is the merge semantics the
 * dotted path promises and the scoping the store cannot see: ownership on the
 * thread, and run-belongs-to-thread on the run.
 */
describe.skipIf(!dbAvailable())("Thread metadata KV (integration)", () => {
  const ctx = useTestDb();

  interface Seed {
    orgScope: ResolvedScope;
    owner: TestUser;
    stranger: TestUser;
    threadId: string;
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
    const stranger = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const scope = await orgScope(services, org.id);
    const threads = buildThreadServices(ctx.threadsDb);
    const created = await makeThread(threads.threads, scope, owner.subject, {
      metadata: { apps: { studio: { theme: "dark" } } },
    });
    return {
      orgScope: scope,
      owner,
      stranger,
      threadId: created.id,
      threads,
    };
  }

  describe("thread", () => {
    it("merges one key and leaves its siblings alone", async () => {
      const s = await seed();
      const updated = await s.threads.metadata.set(
        s.orgScope,
        s.owner.subject,
        s.threadId,
        "apps.studio.pinned",
        true
      );
      expect(updated.metadata).toEqual({
        apps: { studio: { theme: "dark", pinned: true } },
      });
    });

    it("creates missing parents on the way down", async () => {
      const s = await seed();
      const updated = await s.threads.metadata.set(
        s.orgScope,
        s.owner.subject,
        s.threadId,
        "apps.viewer.camera.fov",
        60
      );
      expect(updated.metadata).toEqual({
        apps: { studio: { theme: "dark" }, viewer: { camera: { fov: 60 } } },
      });
    });

    it("stores a nested object verbatim rather than as its JSON text", async () => {
      const s = await seed();
      const promptSpec = { sha256: "0f9c", totalBytes: 4096, parts: [1, 2] };
      const updated = await s.threads.metadata.set(
        s.orgScope,
        s.owner.subject,
        s.threadId,
        "apps.studio.promptSpec",
        promptSpec
      );
      expect(
        (updated.metadata.apps as Record<string, Record<string, unknown>>)
          .studio.promptSpec
      ).toEqual(promptSpec);
    });

    it("removes one key and no-ops on a missing one", async () => {
      const s = await seed();
      const removed = await s.threads.metadata.delete(
        s.orgScope,
        s.owner.subject,
        s.threadId,
        "apps.studio.theme"
      );
      expect(removed.metadata).toEqual({ apps: { studio: {} } });

      const again = await s.threads.metadata.delete(
        s.orgScope,
        s.owner.subject,
        s.threadId,
        "apps.studio.theme"
      );
      expect(again.metadata).toEqual({ apps: { studio: {} } });
    });

    it("rejects a blank path segment", async () => {
      const s = await seed();
      await expect(
        s.threads.metadata.set(
          s.orgScope,
          s.owner.subject,
          s.threadId,
          "apps..studio",
          1
        )
      ).rejects.toThrow();
    });

    it("hides a thread the caller does not own", async () => {
      const s = await seed();
      await expect(
        s.threads.metadata.set(
          s.orgScope,
          s.stranger.subject,
          s.threadId,
          "apps.studio.pinned",
          true
        )
      ).rejects.toMatchObject({ code: ThreadErrors.NOT_FOUND.code });
    });
  });

  describe("run", () => {
    it("merges into the run bag and echoes it on the run response", async () => {
      const s = await seed();
      const run = await s.threads.runs.create(
        s.threadId,
        s.owner.subject,
        null,
        null,
        { apps: { studio: { attempt: 1 } } }
      );

      const updated = await s.threads.runMetadata.set(
        s.threadId,
        run.id,
        "apps.studio.promptSpec",
        { sha256: "0f9c" }
      );
      expect(updated.metadata).toEqual({
        apps: { studio: { attempt: 1, promptSpec: { sha256: "0f9c" } } },
      });
    });

    it("accepts a write after the run has finished", async () => {
      const s = await seed();
      const run = await s.threads.runs.create(
        s.threadId,
        s.owner.subject,
        null,
        null
      );
      await s.threads.runs.cancel(s.threadId, run.id);

      const updated = await s.threads.runMetadata.set(
        s.threadId,
        run.id,
        "apps.studio.outcome",
        "abandoned"
      );
      expect(updated.status).toBe("cancelled");
      expect(updated.metadata).toEqual({
        apps: { studio: { outcome: "abandoned" } },
      });
    });

    it("refuses a run id that belongs to another thread", async () => {
      const s = await seed();
      const other = await makeThread(
        s.threads.threads,
        s.orgScope,
        s.owner.subject
      );
      const run = await s.threads.runs.create(
        other.id,
        s.owner.subject,
        null,
        null
      );

      await expect(
        s.threads.runMetadata.set(
          s.threadId,
          run.id,
          "apps.studio.pinned",
          true
        )
      ).rejects.toMatchObject({ code: ThreadErrors.RUN_NOT_FOUND.code });
    });
  });
});
