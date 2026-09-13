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
import { thread } from "@aec-craft/platform-threads-api";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

/**
 * `ThreadMessageService` against real Postgres. The log is insert-once: the
 * service surface is append + list only, and the database enforces the role
 * vocabulary. Deleting happens only via the parent thread's cascade.
 */
describe.skipIf(!dbAvailable())("ThreadMessageService (integration)", () => {
  const ctx = useTestDb();

  async function seed(): Promise<{
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
    return { threads, threadId: created.id };
  }

  it("appends and lists oldest-first", async () => {
    const s = await seed();
    await s.threads.messages.create(s.threadId, {
      role: "user",
      content: "Wie hoch ist die Traufhöhe?",
    });
    await s.threads.messages.create(s.threadId, {
      role: "assistant",
      content: "Die Traufhöhe beträgt 6,50 m.",
    });

    const list = await s.threads.messages.list(s.threadId, {});
    expect(list.items.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(list.items[0]?.content).toContain("Traufhöhe");
    expect(list.items[0]?.metadata).toEqual({});
    expect(list.items[0]?.references).toBeNull();
    expect(list.items[0]?.parts).toBeNull();
  });

  it("stores structured parts verbatim, alongside references and metadata", async () => {
    const s = await seed();
    // The platform does not own this vocabulary: an unknown `type` and whatever
    // keys ride with it have to survive the round trip untouched.
    const parts = [
      { type: "text", text: "Ich sehe nach." },
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "queryGraph",
        input: { cypher: "MATCH (r:Room) RETURN r", limit: 10 },
      },
      { type: "reasoning", text: "Traufhöhe steht am Dachknoten." },
    ];
    const created = await s.threads.messages.create(s.threadId, {
      role: "assistant",
      content: "Ich sehe nach.",
      parts,
      references: [{ type: "graph_node", id: crypto.randomUUID() }],
      metadata: { overlay: { highlight: true } },
    });

    expect(created.parts).toEqual(parts);
    expect(created.references).toHaveLength(1);
    expect(created.metadata).toEqual({ overlay: { highlight: true } });

    const list = await s.threads.messages.list(s.threadId, {});
    expect(list.items[0]?.parts).toEqual(parts);
    expect(list.items[0]?.references).toHaveLength(1);
    expect(list.items[0]?.metadata).toEqual({ overlay: { highlight: true } });
  });

  it("stores typed entity references and metadata", async () => {
    const s = await seed();
    const created = await s.threads.messages.create(s.threadId, {
      role: "assistant",
      content: "Siehe Raum 1.02.",
      references: [{ type: "graph_node", id: crypto.randomUUID() }],
      metadata: { overlay: { highlight: true } },
    });

    expect(created.references).toHaveLength(1);
    expect(created.references?.[0]?.type).toBe("graph_node");
    expect(created.metadata).toEqual({ overlay: { highlight: true } });
  });

  it("bumps the parent thread's recency on append", async () => {
    const s = await seed();
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

    await s.threads.messages.create(s.threadId, {
      role: "user",
      content: "Nachtrag",
    });

    const after = await ctx.threadsDb
      .select({ updatedAt: thread.updatedAt })
      .from(thread)
      .where(eq(thread.id, s.threadId));
    expect(after[0]!.updatedAt.getTime()).toBeGreaterThan(
      before[0]!.updatedAt.getTime()
    );
  });

  async function seedNumberedMessages(
    threads: ThreadServices,
    threadId: string,
    createdAts: string[]
  ): Promise<void> {
    for (let i = 0; i < createdAts.length; i += 1) {
      const created = await threads.messages.create(threadId, {
        role: "user",
        content: `Nachricht ${i + 1}`,
      });
      // Pin created_at explicitly — inserts land microseconds apart, and the
      // two pagination tests below need controlled fractions.
      await ctx.pool.query(
        "UPDATE thread_message SET created_at = $1 WHERE id = $2",
        [createdAts[i], created.id]
      );
    }
  }

  it("paginates oldest-first by keyset cursor", async () => {
    const s = await seed();
    // Millisecond-aligned instants: these survive the cursor's ISO-8601
    // round-trip exactly.
    await seedNumberedMessages(s.threads, s.threadId, [
      "2026-01-01 10:00:00.100+00",
      "2026-01-01 10:00:00.200+00",
      "2026-01-01 10:00:00.300+00",
    ]);

    const pageOne = await s.threads.messages.list(s.threadId, { limit: 2 });
    expect(pageOne.items.map((m) => m.content)).toEqual([
      "Nachricht 1",
      "Nachricht 2",
    ]);
    expect(pageOne.nextCursor).not.toBeNull();

    const pageTwo = await s.threads.messages.list(s.threadId, {
      limit: 2,
      cursor: pageOne.nextCursor as string,
    });
    expect(pageTwo.items.map((m) => m.content)).toEqual(["Nachricht 3"]);
    expect(pageTwo.nextCursor).toBeNull();
  });

  it("keyset cursor must not duplicate the tail row across pages", async () => {
    const s = await seed();
    // Sub-millisecond fractions, which `timestamptz(3)` rounds on the way in:
    // the first two land on the same millisecond, so the page boundary falls
    // inside it and the id tiebreak has to carry the pair.
    await seedNumberedMessages(s.threads, s.threadId, [
      "2026-01-01 10:00:00.001100+00",
      "2026-01-01 10:00:00.001200+00",
      "2026-01-01 10:00:00.002+00",
    ]);

    const pageOne = await s.threads.messages.list(s.threadId, { limit: 2 });
    // Which of the tied pair sorts first is its (random) uuid's business; that
    // both are on page one and neither returns is the property under test.
    expect(new Set(pageOne.items.map((m) => m.content))).toEqual(
      new Set(["Nachricht 1", "Nachricht 2"])
    );
    expect(pageOne.nextCursor).not.toBeNull();

    const pageTwo = await s.threads.messages.list(s.threadId, {
      limit: 2,
      cursor: pageOne.nextCursor as string,
    });
    expect(pageTwo.items.map((m) => m.content)).toEqual(["Nachricht 3"]);
    expect(pageTwo.nextCursor).toBeNull();
  });

  it("the database rejects roles outside the vocabulary", async () => {
    const s = await seed();
    // Drizzle wraps the pg error; the constraint name rides on `cause`.
    const error: unknown = await s.threads.messages
      .create(s.threadId, { role: "moderator" as never, content: "sneaky" })
      .then(() => null)
      .catch((err: unknown) => err);
    expect(error).not.toBeNull();
    expect(
      (error as { cause?: { constraint?: string } }).cause?.constraint
    ).toBe("thread_message_role_check");
  });

  it("accepts a client-appended assistant message (documented gap)", async () => {
    const s = await seed();
    // TODO(#111): create schema admits assistant role without a run
    const created = await s.threads.messages.create(s.threadId, {
      role: "assistant",
      content: "Direkt eingefügt, ohne Run.",
    });
    expect(created.role).toBe("assistant");
  });
});
