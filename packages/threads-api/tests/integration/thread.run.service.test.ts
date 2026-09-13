import {
  buildServices,
  buildThreadServices,
  dbAvailable,
  makeOrg,
  makeThread,
  makeUser,
  orgScope,
  resetSeq,
  type ThreadServices,
  useTestDb,
} from "@aec-craft/platform-testing";
import { thread, threadRun } from "@aec-craft/platform-threads-api";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ThreadErrors } from "../../src/modules/thread.errors";

/**
 * `ThreadRunService` against real Postgres — the run state machine as clients
 * see it. Without a configured LLM the worker never claims anything, so every
 * transition here is driven explicitly, which is exactly what makes the
 * machine testable: queued → complete/failed/cancelled, and the HITL loop
 * queued → requires_action → (submit) → queued.
 */
describe.skipIf(!dbAvailable())("ThreadRunService (integration)", () => {
  const ctx = useTestDb();

  async function seed(): Promise<{
    ownerId: string;
    threadId: string;
    threads: ThreadServices;
  }> {
    resetSeq();
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const owner = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const threads = buildThreadServices(ctx.threadsDb);
    const created = await makeThread(
      threads.threads,
      await orgScope(services, org.id),
      owner.subject
    );
    return { threads, threadId: created.id, ownerId: owner.subject };
  }

  describe("create", () => {
    it("starts queued with tier and agent config persisted", async () => {
      const s = await seed();
      const run = await s.threads.runs.create(s.threadId, s.ownerId, "fast", {
        instructions: "Antworte knapp.",
        tools: [{ type: "mcp", server: "https://mcp.example.test" }],
      });

      expect(run.status).toBe("queued");
      expect(run.tier).toBe("fast");
      expect(run.subject).toBe(s.ownerId);
      expect(run.messageId).toBeNull();
      expect(run.usage).toBeNull();
      expect(run.completedAt).toBeNull();
      // TODO(#110): same unstamped clientId gap as on threads.
      expect(run.clientId).toBeNull();

      const rows = await ctx.threadsDb
        .select({ agentConfig: threadRun.agentConfig })
        .from(threadRun)
        .where(eq(threadRun.id, run.id));
      expect(rows[0]!.agentConfig?.instructions).toBe("Antworte knapp.");
    });

    it("stores the metadata bag verbatim and defaults it to empty", async () => {
      const s = await seed();
      const run = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null,
        {
          promptSpec: { sha256: "0f9c", totalBytes: 4096 },
        }
      );
      expect(run.metadata).toEqual({
        promptSpec: { sha256: "0f9c", totalBytes: 4096 },
      });

      const bare = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );
      expect(bare.metadata).toEqual({});
      const fetched = await s.threads.runs.findById(s.threadId, run.id);
      expect(fetched.metadata).toEqual({
        promptSpec: { sha256: "0f9c", totalBytes: 4096 },
      });
    });
  });

  describe("complete", () => {
    it("inserts the immutable assistant message and finalizes the run", async () => {
      const s = await seed();
      const run = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );
      // Freeze the baseline: the bump uses the JS clock while the row default
      // was DB `now()` — live timestamps could tie inside one millisecond.
      await ctx.pool.query(
        "UPDATE thread SET updated_at = '2026-01-01 10:00:00+00' WHERE id = $1",
        [s.threadId]
      );
      const before = await ctx.threadsDb
        .select({ updatedAt: thread.updatedAt })
        .from(thread)
        .where(eq(thread.id, s.threadId));

      const completed = await s.threads.runs.complete(s.threadId, run.id, {
        content: "Die Antwort lautet 42.",
        usage: {
          model: "vertex/gemini-2.5-pro",
          inputTokens: 10,
          outputTokens: 5,
        },
      });

      expect(completed.status).toBe("complete");
      expect(completed.messageId).not.toBeNull();
      expect(completed.usage).toEqual({
        model: "vertex/gemini-2.5-pro",
        inputTokens: 10,
        outputTokens: 5,
      });
      expect(completed.completedAt).not.toBeNull();

      const messages = await s.threads.messages.list(s.threadId, {});
      expect(messages.items).toHaveLength(1);
      expect(messages.items[0]).toMatchObject({
        id: completed.messageId,
        role: "assistant",
        content: "Die Antwort lautet 42.",
      });

      const after = await ctx.threadsDb
        .select({ updatedAt: thread.updatedAt })
        .from(thread)
        .where(eq(thread.id, s.threadId));
      expect(after[0]!.updatedAt.getTime()).toBeGreaterThan(
        before[0]!.updatedAt.getTime()
      );
    });

    it("rejects a second transition on a terminal run", async () => {
      const s = await seed();
      const run = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );
      await s.threads.runs.complete(s.threadId, run.id, { content: "Fertig." });

      await expect(
        s.threads.runs.complete(s.threadId, run.id, { content: "Nochmal?" })
      ).rejects.toMatchObject({ code: ThreadErrors.RUN_NOT_PENDING.code });
    });
  });

  describe("fail / cancel", () => {
    it("fail records the error and completedAt", async () => {
      const s = await seed();
      const run = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );

      const failed = await s.threads.runs.fail(s.threadId, run.id, {
        error: "model unavailable",
      });
      expect(failed.status).toBe("failed");
      expect(failed.error).toBe("model unavailable");
      expect(failed.completedAt).not.toBeNull();
      expect(failed.messageId).toBeNull();
    });

    it("cancel is terminal; cancelling again is rejected", async () => {
      const s = await seed();
      const run = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );

      const cancelled = await s.threads.runs.cancel(s.threadId, run.id);
      expect(cancelled.status).toBe("cancelled");

      await expect(
        s.threads.runs.cancel(s.threadId, run.id)
      ).rejects.toMatchObject({ code: ThreadErrors.RUN_NOT_PENDING.code });
    });
  });

  describe("human-in-the-loop (requires_action → submit)", () => {
    it("parks the run with the pending question, then re-queues on submit", async () => {
      const s = await seed();
      const run = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );

      const parked = await s.threads.runs.requireAction(s.threadId, run.id, {
        type: "question",
        prompt: "Welches Geschoss meinst du?",
      });
      expect(parked.status).toBe("requires_action");
      expect(parked.action).toEqual({
        type: "question",
        prompt: "Welches Geschoss meinst du?",
      });

      const resumed = await s.threads.runs.submit(s.threadId, run.id, {
        answer: "Das Erdgeschoss.",
      });
      expect(resumed.status).toBe("queued");
      expect(resumed.action).toBeNull();

      // The answer waits in `resume_input` for the executor's next claim; the
      // wire response deliberately does not expose it.
      const rows = await ctx.threadsDb
        .select({ resumeInput: threadRun.resumeInput })
        .from(threadRun)
        .where(eq(threadRun.id, run.id));
      expect(rows[0]!.resumeInput).toBe("Das Erdgeschoss.");
    });

    it("rejects submit unless the run is requires_action", async () => {
      const s = await seed();
      const run = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );

      await expect(
        s.threads.runs.submit(s.threadId, run.id, { answer: "zu früh" })
      ).rejects.toMatchObject({
        code: ThreadErrors.RUN_NOT_AWAITING_INPUT.code,
      });
    });

    it("a parked run still accepts terminal transitions (current contract)", async () => {
      // `requires_action` counts as active, so complete/fail/cancel remain
      // legal — e.g. cancelling instead of answering. Documents the state
      // machine as built.
      const s = await seed();
      const run = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );
      await s.threads.runs.requireAction(s.threadId, run.id, {
        type: "question",
        prompt: "Weiter?",
      });

      const cancelled = await s.threads.runs.cancel(s.threadId, run.id);
      expect(cancelled.status).toBe("cancelled");
    });

    // TODO(#117): requireAction lacks the active-status assertion
    it.fails("requireAction must not resurrect a terminal run", async () => {
      const s = await seed();
      const run = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );
      await s.threads.runs.cancel(s.threadId, run.id);

      await expect(
        s.threads.runs.requireAction(s.threadId, run.id, {
          type: "question",
          prompt: "Noch da?",
        })
      ).rejects.toMatchObject({ code: ThreadErrors.RUN_NOT_PENDING.code });
    });
  });

  describe("lookup and list", () => {
    it("scopes runs to their thread: foreign threadId → RUN_NOT_FOUND", async () => {
      const s = await seed();
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const otherOwner = await makeUser(ctx.db, services);
      const otherOrg = await makeOrg(services, otherOwner.principal);
      const otherThread = await makeThread(
        s.threads.threads,
        await orgScope(services, otherOrg.id),
        otherOwner.subject
      );
      const run = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );

      await expect(
        s.threads.runs.findById(otherThread.id, run.id)
      ).rejects.toMatchObject({ code: ThreadErrors.RUN_NOT_FOUND.code });
    });

    it("lists most-recent-first and filters by status", async () => {
      const s = await seed();
      const first = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );
      await s.threads.runs.complete(s.threadId, first.id, { content: "Ok." });
      const second = await s.threads.runs.create(
        s.threadId,
        s.ownerId,
        null,
        null
      );

      const all = await s.threads.runs.list(s.threadId, {});
      expect(all.items.map((r) => r.id)).toEqual([second.id, first.id]);

      const completed = await s.threads.runs.list(s.threadId, {
        status: "eq.complete",
      });
      expect(completed.items.map((r) => r.id)).toEqual([first.id]);
    });
  });
});
