/**
 * End-to-end smoke for the graph projection, against a live graph DB:
 *
 *   changeset -> graph_node/graph_edge + graph_version (one transaction)
 *     -> GraphSyncWorker (500ms tick) -> Cypher -> Memgraph
 *     -> the dialect's queries and POST /projects/:id/graph/query answer from
 *        the projection.
 *
 * Prereqs:
 *   - Postgres on 5433 (5432 is cloud-sql-proxy). Uses `platform_test` by
 *     default and WIPES it.
 *   - Keto on 4466/4467: a changeset is authorized, and a stubbed permission
 *     store would assert the stub.
 *   - Memgraph: `pnpm -C packages/graph-api db:graph:up`.
 *
 * Run: `pnpm -C apps/api graph:smoke`. CJS require hook rather than the ESM
 * loader, because this package is CommonJS and a decorated class compiled to
 * CJS has no statically-visible named export for an ESM importer.
 *
 * Two projects, because the assertions want different models. Project A is
 * flat, so the egress distance is the sum of the doors walked and nothing
 * shortcuts through a containment arc. Project B carries both trees, which is
 * where containment is asserted.
 *
 * Prints an SLO table at the end.
 */

import { OrgErrors, ProjectErrors } from "@aec-craft/platform-tenancy-api";
import "reflect-metadata";

import { randomUUID } from "node:crypto";
import { AuthorizationModule } from "@aec-craft/platform-authorization/nest";
import { PlatformExceptionFilter } from "@aec-craft/platform-common/nest";
import { graphVersion } from "@aec-craft/platform-graph-api";
import {
  GraphApiModule,
  MemgraphDialect,
} from "@aec-craft/platform-graph-api/nest";
import { TenancyApiModule } from "@aec-craft/platform-tenancy-api/nest";
import {
  buildServices,
  createTestDb,
  createTestPool,
  dbUrl,
  ensureMigrated,
  makeOrg,
  makeProject,
  makeUser,
  req,
  TestPrincipalGuard,
  TestPrincipalMiddleware,
  truncateAll,
} from "@aec-craft/platform-testing/harness";
import {
  type INestApplication,
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from "@nestjs/common";
import { APP_GUARD, APP_PIPE, NestFactory } from "@nestjs/core";
import { count } from "drizzle-orm";
import { driver as createDriver, type Driver } from "neo4j-driver";
import { ZodValidationPipe } from "nestjs-zod";
import type pg from "pg";

const GRAPH_URI = process.env.GRAPH_DB_URI ?? "bolt://localhost:7687";
const LAG_SLO_MS = 5000;
const URL_CREDENTIALS = /\/\/.*@/;

/**
 * The consuming app, wired like the e2e harness plus a graph DB: the sync
 * worker only ticks when `graphDatabase` is configured, and it is the whole
 * point of this script.
 */
@Module({
  imports: [
    AuthorizationModule.forRoot({
      masks: {
        org: OrgErrors.NOT_FOUND,
        project: ProjectErrors.NOT_FOUND,
      },
      databaseUrl: dbUrl(),
      ketoReadUrl: process.env.KETO_READ_URL ?? "http://localhost:4466",
      ketoWriteUrl: process.env.KETO_WRITE_URL ?? "http://localhost:4467",
      ketoIdentityTokens: false,
    }),
    TenancyApiModule.forRoot({ databaseUrl: dbUrl() }),
    GraphApiModule.forRoot({
      databaseUrl: dbUrl(),
      graphDatabase: { uri: GRAPH_URI, engine: "memgraph", syncEnabled: true },
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: TestPrincipalGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
class SmokeAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TestPrincipalMiddleware).forRoutes("*");
  }
}

interface Timing {
  label: string;
  ms: number;
  pass: boolean;
  target: string;
}
const timings: Timing[] = [];

interface NodeRow {
  class: string;
  id: string;
  name: string;
  version: string;
}

function fail(message: string): never {
  throw new Error(message);
}

async function main(): Promise<void> {
  console.log(
    "graph smoke: changeset -> graph_version -> worker -> Memgraph -> queries\n"
  );

  // ── 0. infra ───────────────────────────────────────────────────────────
  const pool = createTestPool();
  const { db, directoryDb, permissionsDb } = createTestDb(pool);
  // truncateAll clears Keto tuples only when told the store is reachable, and
  // a leftover standing would authorize a changeset this run never granted.
  process.env.PLATFORM_API_KETO_OK ??= "1";
  await ensureMigrated(pool);
  await truncateAll(pool);
  console.log(
    `  ✓ postgres migrated + wiped (${dbUrl().replace(URL_CREDENTIALS, "//***@")})`
  );

  const graphDriver = createDriver(GRAPH_URI);
  await wipeGraph(graphDriver);
  console.log(`  ✓ memgraph reachable + wiped (${GRAPH_URI})`);

  // ── 1. seed tenancy + boot the app ─────────────────────────────────────
  const services = buildServices(db, directoryDb, permissionsDb);
  const user = await makeUser(db, services);
  const org = await makeOrg(services, user.principal);
  const flat = await makeProject(services, org.id, user.principal, {
    name: "Egress model",
  });
  const trees = await makeProject(services, org.id, user.principal, {
    name: "Containment model",
  });

  const app = await NestFactory.create(SmokeAppModule, { logger: false });
  app.useGlobalFilters(new PlatformExceptionFilter());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  const as = req(baseUrl).user({ subject: user.subject, email: user.email });
  console.log(`  ✓ api booted (${baseUrl}), worker ticking\n`);

  const apply = async (
    projectId: string,
    body: { edges?: unknown[]; nodes?: unknown[] }
  ): Promise<{ edges: NodeRow[]; nodes: NodeRow[] }> => {
    const res = await as.post(`/projects/${projectId}/graph`, {
      edges: body.edges ?? [],
      nodes: body.nodes ?? [],
    });
    if (res.status !== 200) {
      fail(
        `POST /projects/${projectId}/graph -> ${res.status}: ${JSON.stringify(res.body)}`
      );
    }
    const parsed = res.body as {
      edges: { items: NodeRow[] };
      nodes: { items: NodeRow[] };
    };
    return { nodes: parsed.nodes.items, edges: parsed.edges.items };
  };

  // ── 2. the egress model, flat and over one changeset ────────────────────
  // rooms 1-3 -- corridor -- exit (fire escape); room 4 deliberately
  // disconnected. Edge lengths are synthetic: the `geometry.length` catalog
  // block is a known follow-up, and the projection just mirrors them.
  const t0 = Date.now();
  const space = (name: string, cls: string, properties = {}) => ({
    op: "create",
    type: "object",
    class: cls,
    name,
    properties,
  });
  const flatWrite = await apply(flat.id, {
    nodes: [
      space("Room 1", "space.room", { habitable: true }),
      space("Room 2", "space.room", { habitable: true }),
      space("Room 3", "space.room", { habitable: true }),
      space("Room 4 (disconnected)", "space.room", { habitable: true }),
      space("Corridor", "space.corridor"),
      space("Fire escape", "space.exit", { isFireEscape: true }),
    ],
  });
  const byName = new Map(flatWrite.nodes.map((node) => [node.name, node]));
  const nodeId = (name: string): string =>
    byName.get(name)?.id ?? fail(`no node named ${name}`);
  const room1 = nodeId("Room 1");
  const corridor = nodeId("Corridor");
  const exit = nodeId("Fire escape");

  const door = (sourceId: string, targetId: string, length: number) => ({
    op: "create",
    type: "connectsTo",
    sourceId,
    targetId,
    properties: { length, passable: true },
  });
  await apply(flat.id, {
    edges: [
      door(room1, corridor, 8),
      door(nodeId("Room 2"), corridor, 12),
      door(nodeId("Room 3"), corridor, 21),
      door(corridor, exit, 9),
    ],
  });
  console.log(
    "  ✓ egress model over the changeset: 6 nodes, 4 edges (room 4 disconnected)"
  );

  // ── 3. both trees, in the second project ───────────────────────────────
  // parentId is the only containment input; the projection derives the arc.
  // Client-supplied ids, so a child can name its parent in the same changeset.
  const building = randomUUID();
  const storey = randomUUID();
  const act = randomUUID();
  await apply(trees.id, {
    nodes: [
      { ...space("Haus A", "building"), id: building },
      { ...space("Erdgeschoss", "storey"), id: storey, parentId: building },
      { ...space("Wohnzimmer", "space.room"), parentId: storey },
      {
        op: "create",
        id: act,
        type: "source",
        class: "source.law.lbo_bw",
        name: "LBO BW",
      },
      {
        op: "create",
        type: "source",
        class: "source.law.lbo_bw",
        name: "§ 34 LBO BW",
        parentId: act,
      },
    ],
  });
  console.log(
    "  ✓ containment model: building > storey > room, and act > section"
  );

  // ── 4. wait for the projection, measure lag ────────────────────────────
  const lagMs = await waitFor(
    graphDriver,
    "MATCH (n:Node) RETURN count(n) AS c",
    11,
    t0
  );
  await waitFor(
    graphDriver,
    "MATCH ()-[r:CONNECTS_TO]->() RETURN count(r) AS c",
    4,
    t0
  );
  timings.push({
    label: "sync lag (writes -> visible)",
    ms: lagMs,
    target: `< ${LAG_SLO_MS}ms`,
    pass: lagMs < LAG_SLO_MS,
  });
  console.log(`  ✓ projection caught up in ${lagMs}ms`);

  // ── 5. the containment arcs are two relations, not one ─────────────────
  const scalar = async (text: string, params = {}): Promise<number> => {
    const session = graphDriver.session();
    try {
      const result = await session.run(text, params);
      return Number(result.records[0]?.get(0) ?? 0);
    } finally {
      await session.close();
    }
  };

  const contains = await scalar(
    "MATCH (p)-[r:CONTAINS {fromParentId: true}]->(c) RETURN count(r)"
  );
  const includes = await scalar(
    "MATCH (p)-[r:INCLUDES {fromParentId: true}]->(c) RETURN count(r)"
  );
  if (contains !== 2) {
    fail(`expected 2 CONTAINS arcs (storey, room), got ${contains}`);
  }
  if (includes !== 1) {
    fail(`expected 1 INCLUDES arc (the section), got ${includes}`);
  }
  console.log(
    `  ✓ containment split: ${contains} CONTAINS (spatial), ${includes} INCLUDES (document)`
  );

  // The payoff: the dialect's spatial traversal is CONTAINS|ADJACENT_TO|BOUNDS,
  // so a walk from the building must not reach a document unit.
  const spatialReach = await scalar(
    `MATCH (b:Node {id: $building})
     MATCH path = (b)-[:CONTAINS|ADJACENT_TO|BOUNDS *BFS ..50]->(n:Node)
     RETURN count(DISTINCT n)`,
    { building }
  );
  const docReach = await scalar(
    `MATCH (a:Node {id: $act})
     MATCH path = (a)-[:INCLUDES *BFS ..50]->(n:Node)
     RETURN count(DISTINCT n)`,
    { act }
  );
  if (spatialReach !== 2) {
    fail(
      `spatial walk from the building expected 2 nodes, got ${spatialReach}`
    );
  }
  if (docReach !== 1) {
    fail(`document walk from the act expected 1 node, got ${docReach}`);
  }
  console.log(
    "  ✓ isolation: the spatial walk reaches 2 spaces and no document unit"
  );

  // ── 6. version-log invariants ──────────────────────────────────────────
  const versionCount = async (): Promise<number> => {
    const rows = await db.select({ c: count() }).from(graphVersion).execute();
    return Number(rows[0]?.c ?? 0);
  };
  const before = await versionCount();
  // 11 nodes + 4 edges, one row each.
  if (before !== 15) {
    fail(`expected 15 version rows after 15 mutations, got ${before}`);
  }

  const noop = await apply(flat.id, {
    nodes: [{ op: "update", id: room1, name: "Room 1" }],
  });
  if (noop.nodes[0]?.version !== "1") {
    fail(`no-op update bumped the version to ${noop.nodes[0]?.version}`);
  }
  if ((await versionCount()) !== before) {
    fail("no-op update wrote a version row");
  }
  console.log("  ✓ no-op update: no version bump, no version row");

  const renamed = await apply(flat.id, {
    nodes: [{ op: "update", id: room1, name: "Room 1 (renamed)" }],
  });
  if (renamed.nodes[0]?.version !== "2") {
    fail("real update did not bump the version");
  }
  if ((await versionCount()) !== before + 1) {
    fail("real update wrote != 1 version row");
  }
  console.log("  ✓ real update: version 2, exactly one new version row");

  // ── 7. the three dialect queries ───────────────────────────────────────
  const dialect = new MemgraphDialect();
  const session = graphDriver.session();
  try {
    let started = Date.now();
    const egressStatement = dialect.egressQuery({
      projectId: flat.id,
      fromNodeId: room1,
      exitClass: "space.exit",
    });
    const egress = await session.run(
      egressStatement.text,
      egressStatement.params
    );
    const egressMs = Date.now() - started;
    const distance = egress.records[0]?.get("distanceM") as number | undefined;
    if (typeof distance !== "number" || Math.abs(distance - 17) > 0.001) {
      fail(`egress distance expected 17 (8+9), got ${String(distance)}`);
    }
    timings.push({
      label: "egress query",
      ms: egressMs,
      target: "< 200ms",
      pass: egressMs < 200,
    });
    console.log(
      `  ✓ egress: Room 1 -> Fire escape = ${distance}m (8 + 9) in ${egressMs}ms`
    );

    started = Date.now();
    const connStatement = dialect.connectivityQuery({
      projectId: flat.id,
      roomClass: "space.room",
      exitClass: "space.exit",
    });
    const conn = await session.run(connStatement.text, connStatement.params);
    const connMs = Date.now() - started;
    const unreachable = conn.records.map((record) =>
      String(record.get("name"))
    );
    if (unreachable.length !== 1 || !unreachable[0]?.startsWith("Room 4")) {
      fail(
        `connectivity expected exactly [Room 4...], got ${JSON.stringify(unreachable)}`
      );
    }
    timings.push({
      label: "connectivity query",
      ms: connMs,
      target: "< 500ms",
      pass: connMs < 500,
    });
    console.log(
      `  ✓ connectivity: unreachable = ${JSON.stringify(unreachable)} in ${connMs}ms`
    );

    const wccStatement = dialect.wccQuery({
      projectId: flat.id,
      roomClass: "space.room",
    });
    const wcc = await session.run(wccStatement.text, wccStatement.params);
    console.log(
      `  ✓ wcc: ${wcc.records.length} component(s): ${wcc.records
        .map((record) => `size=${String(record.get("size"))}`)
        .join(", ")}`
    );
  } finally {
    await session.close();
  }

  // ── 8. the cypher route ────────────────────────────────────────────────
  const query = async (
    projectId: string,
    body: Record<string, unknown>,
    expectStatus = 200
  ): Promise<{ records: Record<string, unknown>[] }> => {
    const res = await as.post(`/projects/${projectId}/graph/query`, body);
    if (res.status !== expectStatus) {
      fail(
        `POST /projects/${projectId}/graph/query -> ${res.status}, expected ${expectStatus}: ${JSON.stringify(res.body)}`
      );
    }
    return res.body as { records: Record<string, unknown>[] };
  };

  const counted = await query(flat.id, {
    query: "MATCH (n:Node) WHERE n.projectId = $projectId RETURN count(n) AS c",
  });
  if (counted.records[0]?.c !== 6) {
    fail(`route count expected 6 nodes, got ${String(counted.records[0]?.c)}`);
  }
  console.log("  ✓ query route: scoped count returns the project's 6 nodes");

  await query(flat.id, { query: "MATCH (n:Node) DETACH DELETE n" }, 400);
  console.log("  ✓ query route: a write clause is refused");

  // ── 9. delete converges ────────────────────────────────────────────────
  const deletedAt = Date.now();
  await apply(flat.id, { nodes: [{ op: "delete", id: nodeId("Room 3") }] });
  const deleteLag = await waitFor(
    graphDriver,
    "MATCH (n:Node) RETURN count(n) AS c",
    10,
    deletedAt
  );
  const orphaned = await scalar("MATCH ()-[r:CONNECTS_TO]->() RETURN count(r)");
  if (orphaned !== 3) {
    fail(`expected the deleted room's door to go with it, got ${orphaned}`);
  }
  timings.push({
    label: "delete convergence",
    ms: deleteLag,
    target: `< ${LAG_SLO_MS}ms`,
    pass: deleteLag < LAG_SLO_MS,
  });
  console.log(
    `  ✓ delete: node and its edge gone from the projection in ${deleteLag}ms`
  );

  // ── 10. SLO table ──────────────────────────────────────────────────────
  console.log(
    "\n  measurement                       ms      target     result"
  );
  console.log("  ─────────────────────────────────────────────────────────");
  for (const timing of timings) {
    console.log(
      `  ${timing.label.padEnd(33)} ${String(timing.ms).padStart(5)}   ${timing.target.padEnd(10)} ${timing.pass ? "pass" : "FAIL"}`
    );
  }
  const failed = timings.filter((timing) => !timing.pass);
  console.log(
    `\n  ${failed.length === 0 ? "all green" : `${failed.length} over target`}\n`
  );

  await shutdown(app, graphDriver, pool);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

/** Empty the projection so a run starts from the same place every time. */
async function wipeGraph(graphDriver: Driver): Promise<void> {
  const session = graphDriver.session();
  try {
    await session.run("MATCH (n) DETACH DELETE n");
  } finally {
    await session.close();
  }
}

/** Poll one scalar query until it reaches `expected`, or give up at the SLO. */
async function waitFor(
  graphDriver: Driver,
  text: string,
  expected: number,
  since: number
): Promise<number> {
  const deadline = Date.now() + LAG_SLO_MS * 2;
  let last = -1;
  while (Date.now() < deadline) {
    const session = graphDriver.session();
    try {
      const result = await session.run(text);
      last = Number(result.records[0]?.get("c") ?? -1);
      if (last === expected) {
        return Date.now() - since;
      }
    } finally {
      await session.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return fail(`timed out waiting for ${expected} (last saw ${last}): ${text}`);
}

async function shutdown(
  app: INestApplication,
  graphDriver: Driver,
  pool: pg.Pool
): Promise<void> {
  await app.close();
  await graphDriver.close();
  await pool.end().catch(() => {
    // the app's own pool may already have ended it
  });
}

main().catch((error: unknown) => {
  console.error(`\n  smoke failed: ${(error as Error).message}\n`);
  process.exit(1);
});
