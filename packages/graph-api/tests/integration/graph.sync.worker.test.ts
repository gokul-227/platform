import { graphVersion, parseConfig } from "@aec-craft/platform-graph-api";
import { GraphSyncWorker } from "@aec-craft/platform-graph-api/nest";
import {
  buildServices,
  createEdge,
  createNode,
  dbAvailable,
  dbUrl,
  makeOrg,
  makeUser,
  orgScope,
  resetSeq,
  updateNode,
  useTestDb,
} from "@aec-craft/platform-testing";
import type { Driver } from "neo4j-driver";
import { describe, expect, it } from "vitest";

interface Recorded {
  params: Record<string, unknown>;
  text: string;
}

/**
 * Bolt driver stand-in: records every statement the worker runs through its
 * write transaction. `failing: true` simulates a graph DB outage.
 */
function fakeDriver(recorded: Recorded[], failing = false): Driver {
  return {
    session: () => ({
      executeWrite: async (
        work: (tx: {
          run: (text: string, params: Record<string, unknown>) => Promise<void>;
        }) => Promise<void>
      ) => {
        if (failing) {
          throw new Error("bolt connection refused");
        }
        await work({
          run: async (text, params) => {
            recorded.push({ text, params });
          },
        });
      },
      close: async () => {},
    }),
  } as unknown as Driver;
}

function testConfig() {
  return parseConfig({
    databaseUrl: dbUrl(),
    graphDatabase: {
      uri: "bolt://fake",
      engine: "memgraph",
      syncEnabled: false,
    },
  });
}

describe.skipIf(!dbAvailable())("GraphSyncWorker (integration)", () => {
  const ctx = useTestDb();

  it("tick() projects pending version rows in seq order and marks them synced", async () => {
    resetSeq();
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const owner = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const scope = await orgScope(services, org.id);

    const a = await createNode(services, scope, {
      type: "object",
      class: "space.residential.kitchen",
      name: "K",
      properties: { envelope: { netArea: 12.5 } },
    });
    const b = await createNode(services, scope, {
      type: "object",
      class: "space.residential.bathroom",
      name: "B",
    });
    const edge = await createEdge(services, scope, {
      sourceId: a.id,
      targetId: b.id,
      type: "adjacentTo",
      properties: { length: 1.2, passable: true },
    });

    const recorded: Recorded[] = [];
    const worker = new GraphSyncWorker(
      ctx.db,
      fakeDriver(recorded),
      testConfig(),
      services.graphVersions
    );

    expect(await worker.tick()).toBe(3);

    // Statements arrive in seq order: node a, node b, then the edge.
    const upsertA = recorded.findIndex(
      (s) => s.text.includes("MERGE (n:Node {id: $id})") && s.params.id === a.id
    );
    const upsertB = recorded.findIndex(
      (s) => s.text.includes("MERGE (n:Node {id: $id})") && s.params.id === b.id
    );
    const edgeCreate = recorded.findIndex((s) =>
      s.text.includes("CREATE (a)-[r:`ADJACENT_TO`]")
    );
    expect(upsertA).toBeGreaterThanOrEqual(0);
    expect(upsertB).toBeGreaterThan(upsertA);
    expect(edgeCreate).toBeGreaterThan(upsertB);

    const edgeProps = recorded[edgeCreate]?.params.props as Record<
      string,
      unknown
    >;
    expect(edgeProps).toMatchObject({
      id: edge.id,
      length: 1.2,
      passable: true,
    });

    // All rows marked synced: a second tick has nothing to do.
    const rows = await ctx.db.select().from(graphVersion);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.syncedAt).toBeInstanceOf(Date);
    }
    expect(await worker.tick()).toBe(0);
    expect(
      recorded.filter((s) => s.text.includes("MERGE (n:Node {id: $id})"))
    ).toHaveLength(2);
  });

  it("Cypher failure: tick() rejects, rows stay unsynced, a healthy tick recovers", async () => {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const owner = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const scope = await orgScope(services, org.id);
    await createNode(services, scope, {
      type: "object",
      class: "space.residential.kitchen",
      name: "K",
    });
    await createNode(services, scope, {
      type: "object",
      class: "space.residential.bathroom",
      name: "B",
    });

    const broken = new GraphSyncWorker(
      ctx.db,
      fakeDriver([], true),
      testConfig(),
      services.graphVersions
    );
    await expect(broken.tick()).rejects.toThrow("bolt connection refused");

    // The claim transaction rolled back; both rows are claimable again.
    const unsynced = await ctx.db.transaction(
      async (trx) => await services.graphVersions.claimUnsynced(trx, 100)
    );
    expect(unsynced).toHaveLength(2);

    const recorded: Recorded[] = [];
    const healthy = new GraphSyncWorker(
      ctx.db,
      fakeDriver(recorded),
      testConfig(),
      services.graphVersions
    );
    expect(await healthy.tick()).toBe(2);
    expect(recorded.length).toBeGreaterThan(0);
    expect(await healthy.tick()).toBe(0);
  });

  it("batch respects claim order across entity kinds (interleaved node/edge mutations)", async () => {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const owner = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const scope = await orgScope(services, org.id);

    const a = await createNode(services, scope, {
      type: "object",
      class: "space.residential.kitchen",
      name: "K",
    });
    const b = await createNode(services, scope, {
      type: "object",
      class: "space.residential.bathroom",
      name: "B",
    });
    const edge = await createEdge(services, scope, {
      sourceId: a.id,
      targetId: b.id,
      type: "adjacentTo",
    });
    await updateNode(services, scope, a.id, { name: "K renamed" });

    const recorded: Recorded[] = [];
    const worker = new GraphSyncWorker(
      ctx.db,
      fakeDriver(recorded),
      testConfig(),
      services.graphVersions
    );
    expect(await worker.tick()).toBe(4);

    // Reduce the statement stream to one marker per projected event and
    // verify it matches the mutation (seq) order, node and edge interleaved.
    const markers = recorded.flatMap((s) => {
      if (s.text.includes("MERGE (n:Node {id: $id})")) {
        const props = s.params.props as Record<string, unknown>;
        return [`node:${String(s.params.id)}:v${String(props.version)}`];
      }
      if (s.text.includes("CREATE (a)-[r:")) {
        const props = s.params.props as Record<string, unknown>;
        return [`edge:${String(props.id)}:v${String(props.version)}`];
      }
      return [];
    });
    expect(markers).toEqual([
      `node:${a.id}:v1`,
      `node:${b.id}:v1`,
      `edge:${edge.id}:v1`,
      `node:${a.id}:v2`,
    ]);
  });
});
