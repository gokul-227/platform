import {
  AuthenticationErrors,
  AuthorizationErrors,
  type ThreadRunStreamEvent,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  type AuthorizationDatabase,
  AuthorizationDatabaseToken,
  bootstrapTestApp,
  buildServices,
  createTestPool,
  DatabasePoolToken,
  dbAvailable,
  ensureMigrated,
  type GraphDatabase,
  GraphDatabaseToken,
  grantStanding,
  groupOf,
  ketoAvailable,
  makeOrg,
  makeProject,
  makeUser,
  req,
  resetSeq,
  type Services,
  type TenancyDatabase,
  TenancyDatabaseToken,
  type TestUser,
  truncateAll,
  type UsersDatabase,
  UsersDatabaseToken,
} from "@aec-craft/platform-testing";
import {
  RunEventBus,
  ThreadRunService,
} from "@aec-craft/platform-threads-api/nest";
import type { INestApplication } from "@nestjs/common";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ThreadErrors } from "../../src/modules/thread.errors";

/** Parse the `data:` lines of a finished SSE body into typed events. */
function parseSse(text: string): ThreadRunStreamEvent[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()) as ThreadRunStreamEvent);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!(dbAvailable() && ketoAvailable()))("/threads (e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    // Vitest runs files in nondeterministic order; an integration suite may
    // not have migrated the fresh test DB yet when this one boots.
    const pool = createTestPool();
    await ensureMigrated(pool);
    await pool.end();
    ({ app, baseUrl } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app.get<pg.Pool>(DatabasePoolToken));
    resetSeq();
  });

  interface Seed {
    org: { id: string };
    owner: TestUser;
    services: Services;
  }

  async function seed(): Promise<Seed> {
    const services = buildServices(
      app.get<GraphDatabase>(GraphDatabaseToken),
      app.get<TenancyDatabase>(TenancyDatabaseToken),
      app.get<UsersDatabase>(UsersDatabaseToken),
      app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
    );
    const owner = await makeUser(
      app.get<GraphDatabase>(GraphDatabaseToken),
      services
    );
    const org = await makeOrg(services, owner.principal);
    return { services, owner, org };
  }

  async function createThread(s: Seed): Promise<{ id: string }> {
    const res = await req(baseUrl)
      .user({ subject: s.owner.subject, email: s.owner.email })
      .post("/threads", {
        scope: { type: "org", orgId: s.org.id },
        title: "E2E Thread",
      });
    if (res.status !== 201) {
      throw new Error(`fixture thread create failed: ${res.status}`);
    }
    return res.body as { id: string };
  }

  it("401s without a principal", async () => {
    const res = await req(baseUrl).get("/threads?orgId=any");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: { code: AuthenticationErrors.PRINCIPAL_REQUIRED.code },
    });
  });

  it("owner walks the full thread lifecycle", async () => {
    const s = await seed();
    const asOwner = req(baseUrl).user({
      subject: s.owner.subject,
      email: s.owner.email,
    });

    const created = await asOwner.post("/threads", {
      scope: { type: "org", orgId: s.org.id },
      title: "Traufhöhen-Chat",
    });
    expect(created.status).toBe(201);
    const thread = created.body as { id: string; subject: string };
    // Owner is stamped from the token's subject, never from the body.
    expect(thread).toMatchObject({
      subject: s.owner.subject,
      title: "Traufhöhen-Chat",
      projectId: null,
      clientId: null,
    });

    const listed = await asOwner.get(`/threads?orgId=${s.org.id}`);
    expect(listed.status).toBe(200);
    expect(
      (listed.body as { items: { id: string }[] }).items.map((t) => t.id)
    ).toEqual([thread.id]);

    const fetched = await asOwner.get(`/threads/${thread.id}`);
    expect(fetched.status).toBe(200);

    const renamed = await asOwner.patch(`/threads/${thread.id}`, {
      title: "Umbenannt",
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ title: "Umbenannt" });

    const keyed = await asOwner.put(
      `/threads/${thread.id}/metadata/apps.studio.theme`,
      { value: "dark" }
    );
    expect(keyed.status).toBe(200);
    expect(keyed.body).toMatchObject({
      metadata: { apps: { studio: { theme: "dark" } } },
    });

    const unkeyed = await asOwner.delete(
      `/threads/${thread.id}/metadata/apps.studio.theme`
    );
    expect(unkeyed.status).toBe(200);
    expect(unkeyed.body).toMatchObject({ metadata: { apps: { studio: {} } } });

    const deleted = await asOwner.delete(`/threads/${thread.id}`);
    expect(deleted.status).toBe(204);

    const gone = await asOwner.get(`/threads/${thread.id}`);
    expect(gone.status).toBe(404);
    expect(gone.body).toMatchObject({
      error: { code: ThreadErrors.NOT_FOUND.code },
    });
  });

  it("400s a list naming neither org nor project scope", async () => {
    const s = await seed();
    const res = await req(baseUrl)
      .user({ subject: s.owner.subject, email: s.owner.email })
      .get("/threads");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: ValidationErrors.FAILED.code },
    });
  });

  it("403s a non-member creating a thread in a foreign org", async () => {
    const s = await seed();
    const stranger = await makeUser(
      app.get<GraphDatabase>(GraphDatabaseToken),
      s.services
    );

    const res = await req(baseUrl)
      .user({ subject: stranger.subject, email: stranger.email })
      .post("/threads", { scope: { type: "org", orgId: s.org.id } });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: { code: AuthorizationErrors.FORBIDDEN.code },
    });
  });

  it("masks another member's thread as 404, never 403", async () => {
    const s = await seed();
    const thread = await createThread(s);
    // A manager's standing covers every thread permission on the group —
    // ownership still wins.
    const manager = await makeUser(
      app.get<GraphDatabase>(GraphDatabaseToken),
      s.services
    );
    await grantStanding(
      s.services,
      s.owner.principal,
      await groupOf(s.services, { orgId: s.org.id }),
      manager.subject,
      "manager"
    );
    const asManager = req(baseUrl).user({
      subject: manager.subject,
      email: manager.email,
    });

    const read = await asManager.get(`/threads/${thread.id}`);
    expect(read.status).toBe(404);
    expect(read.body).toMatchObject({
      error: { code: ThreadErrors.NOT_FOUND.code },
    });

    const write = await asManager.patch(`/threads/${thread.id}`, {
      title: "Hijack",
    });
    expect(write.status).toBe(404);

    const messages = await asManager.get(`/threads/${thread.id}/messages`);
    expect(messages.status).toBe(404);

    // Runs authorize through the same guard, but `ThreadRunController` wires
    // it separately — cover its routes too, including the SSE pipeline.
    const runCreated = await req(baseUrl)
      .user({ subject: s.owner.subject, email: s.owner.email })
      .post(`/threads/${thread.id}/runs`, {});
    expect(runCreated.status).toBe(201);
    const runId = (runCreated.body as { id: string }).id;

    const runs = await asManager.get(`/threads/${thread.id}/runs`);
    expect(runs.status).toBe(404);

    const stream = await fetch(
      `${baseUrl}/threads/${thread.id}/runs/${runId}/stream`,
      {
        headers: {
          "x-test-subject": manager.subject,
          accept: "text/event-stream",
        },
      }
    );
    expect(stream.status).toBe(404);
    expect(await stream.json()).toMatchObject({
      error: { code: ThreadErrors.NOT_FOUND.code },
    });

    // The owner's list stays private; the manager's own list is empty.
    const list = await asManager.get(`/threads?orgId=${s.org.id}`);
    expect(list.status).toBe(200);
    expect((list.body as { items: unknown[] }).items).toEqual([]);
  });

  it("resolves project scope on the wire: create via body, list via query", async () => {
    const s = await seed();
    const project = await makeProject(s.services, s.org.id, s.owner.principal);
    const asOwner = req(baseUrl).user({
      subject: s.owner.subject,
      email: s.owner.email,
    });

    // The wire scope names only the project; the guard resolves the parent org.
    const created = await asOwner.post("/threads", {
      scope: { type: "project", projectId: project.id },
      title: "Projekt-Chat",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      orgId: s.org.id,
      projectId: project.id,
    });
    const threadId = (created.body as { id: string }).id;

    const listed = await asOwner.get(`/threads?projectId=${project.id}`);
    expect(listed.status).toBe(200);
    expect(
      (listed.body as { items: { id: string }[] }).items.map((t) => t.id)
    ).toEqual([threadId]);

    // Org XOR project holds on the wire too: the org list stays empty.
    const orgList = await asOwner.get(`/threads?orgId=${s.org.id}`);
    expect(orgList.status).toBe(200);
    expect((orgList.body as { items: unknown[] }).items).toEqual([]);
  });

  it("appends and lists messages through the wire", async () => {
    const s = await seed();
    const thread = await createThread(s);
    const asOwner = req(baseUrl).user({
      subject: s.owner.subject,
      email: s.owner.email,
    });

    // Parts are opaque on the wire: an app-owned `type` and its payload pass
    // validation and come back as sent, while a message without them reads null.
    const parts = [
      { type: "text", text: "Erste Frage" },
      { type: "file", mediaType: "application/pdf", url: "https://x/y.pdf" },
    ];
    const first = await asOwner.post(`/threads/${thread.id}/messages`, {
      role: "user",
      content: "Erste Frage",
      parts,
    });
    expect(first.status).toBe(201);
    expect((first.body as { parts: unknown }).parts).toEqual(parts);
    const second = await asOwner.post(`/threads/${thread.id}/messages`, {
      role: "user",
      content: "Zweite Frage",
    });
    expect(second.status).toBe(201);

    const list = await asOwner.get(`/threads/${thread.id}/messages`);
    expect(list.status).toBe(200);
    const items = (
      list.body as { items: { content: string; parts: unknown }[] }
    ).items;
    expect(items.map((m) => m.content)).toEqual([
      "Erste Frage",
      "Zweite Frage",
    ]);
    expect(items[0]?.parts).toEqual(parts);
    expect(items[1]?.parts).toBeNull();
  });

  it("drives the run lifecycle over HTTP: queued → cancel, submit guarded", async () => {
    const s = await seed();
    const thread = await createThread(s);
    const asOwner = req(baseUrl).user({
      subject: s.owner.subject,
      email: s.owner.email,
    });

    // No LLM is configured in the test host, so the run stays `queued` —
    // the executor-less contract the config documents.
    const created = await asOwner.post(`/threads/${thread.id}/runs`, {
      metadata: { source: "e2e" },
    });
    expect(created.status).toBe(201);
    const run = created.body as {
      id: string;
      status: string;
      metadata: Record<string, unknown>;
    };
    expect(run.status).toBe("queued");
    expect(run.metadata).toEqual({ source: "e2e" });

    const polled = await asOwner.get(`/threads/${thread.id}/runs/${run.id}`);
    expect(polled.status).toBe(200);
    expect(
      (polled.body as { metadata: Record<string, unknown> }).metadata
    ).toEqual({ source: "e2e" });

    const keyed = await asOwner.put(
      `/threads/${thread.id}/runs/${run.id}/metadata/apps.studio.promptSpec`,
      { value: { sha256: "0f9c", totalBytes: 4096 } }
    );
    expect(keyed.status).toBe(200);
    expect(
      (keyed.body as { metadata: Record<string, unknown> }).metadata
    ).toEqual({
      source: "e2e",
      apps: { studio: { promptSpec: { sha256: "0f9c", totalBytes: 4096 } } },
    });

    const unkeyed = await asOwner.delete(
      `/threads/${thread.id}/runs/${run.id}/metadata/apps.studio.promptSpec`
    );
    expect(unkeyed.status).toBe(200);
    // The key the run was created with is not a metadata write and survives.
    expect(
      (unkeyed.body as { metadata: Record<string, unknown> }).metadata
    ).toEqual({ source: "e2e", apps: { studio: {} } });

    const submitted = await asOwner.post(
      `/threads/${thread.id}/runs/${run.id}/submit`,
      { answer: "zu früh" }
    );
    expect(submitted.status).toBe(409);
    expect(submitted.body).toMatchObject({
      error: { code: ThreadErrors.RUN_NOT_AWAITING_INPUT.code },
    });

    const cancelled = await asOwner.post(
      `/threads/${thread.id}/runs/${run.id}/cancel`
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: "cancelled" });

    const again = await asOwner.post(
      `/threads/${thread.id}/runs/${run.id}/cancel`
    );
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({
      error: { code: ThreadErrors.RUN_NOT_PENDING.code },
    });
  });

  describe("run stream (SSE)", () => {
    async function startRun(s: Seed, threadId: string): Promise<string> {
      const res = await req(baseUrl)
        .user({ subject: s.owner.subject, email: s.owner.email })
        .post(`/threads/${threadId}/runs`, {});
      if (res.status !== 201) {
        throw new Error(`fixture run create failed: ${res.status}`);
      }
      return (res.body as { id: string }).id;
    }

    function openStream(
      s: Seed,
      threadId: string,
      runId: string
    ): Promise<Response> {
      return fetch(`${baseUrl}/threads/${threadId}/runs/${runId}/stream`, {
        headers: {
          "x-test-subject": s.owner.subject,
          accept: "text/event-stream",
        },
      });
    }

    it("replays a completed run as a bare done event", async () => {
      const s = await seed();
      const thread = await createThread(s);
      const runId = await startRun(s, thread.id);
      await app
        .get(ThreadRunService)
        .complete(thread.id, runId, { content: "Fertige Antwort." });

      const res = await openStream(s, thread.id, runId);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const events = parseSse(await res.text());
      expect(events).toEqual([{ type: "done", status: "complete" }]);
    });

    it("replays a failed run as error + done", async () => {
      const s = await seed();
      const thread = await createThread(s);
      const runId = await startRun(s, thread.id);
      await app
        .get(ThreadRunService)
        .fail(thread.id, runId, { error: "Modell nicht erreichbar." });

      const res = await openStream(s, thread.id, runId);
      const events = parseSse(await res.text());
      expect(events).toEqual([
        { type: "error", error: "Modell nicht erreichbar." },
        { type: "done", status: "failed" },
      ]);
    });

    it("replays a parked run as its pending action + done", async () => {
      const s = await seed();
      const thread = await createThread(s);
      const runId = await startRun(s, thread.id);
      await app.get(ThreadRunService).requireAction(thread.id, runId, {
        type: "question",
        prompt: "Welches Gebäude?",
      });

      const res = await openStream(s, thread.id, runId);
      const events = parseSse(await res.text());
      expect(events).toEqual([
        {
          type: "action",
          action: { type: "question", prompt: "Welches Gebäude?" },
        },
        { type: "done", status: "requires_action" },
      ]);
    });

    it("forwards live bus events to a connected client until done", async () => {
      const s = await seed();
      const thread = await createThread(s);
      const runId = await startRun(s, thread.id);
      const bus = app.get(RunEventBus);

      const res = await openStream(s, thread.id, runId);
      expect(res.status).toBe(200);
      let closed = false;
      const body = res.text().finally(() => {
        closed = true;
      });

      // Publish until the server closes the stream: the subscription attaches
      // while the response is being set up, so the first bursts may land
      // before it — repeating makes the test immune to that race.
      for (let i = 0; i < 50 && !closed; i += 1) {
        bus.publish(runId, { type: "token", delta: `t${i}` });
        bus.publish(runId, { type: "done", status: "complete" });
        await sleep(100);
      }

      const events = parseSse(await body);
      expect(events.some((e) => e.type === "token")).toBe(true);
      expect(events.at(-1)).toEqual({ type: "done", status: "complete" });
    });
  });
});
