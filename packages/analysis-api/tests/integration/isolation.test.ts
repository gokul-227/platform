import {
  MemgraphDialect,
  ProjectionSessionService,
} from "@aec-craft/platform-graph-client";
import { driver as createDriver } from "neo4j-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AnalysisAdjacencyService } from "../../src/modules/adjacency/analysis.adjacency.service";
import { AnalysisChokepointsService } from "../../src/modules/chokepoints/analysis.chokepoints.service";
import { AnalysisConnectivityService } from "../../src/modules/connectivity/analysis.connectivity.service";
import { AnalysisContainmentService } from "../../src/modules/containment/analysis.containment.service";
import { AnalysisEgressService } from "../../src/modules/egress/analysis.egress.service";
import { CypherQueryService } from "../../src/modules/query/cypher.query.service";
import { AnalysisRoutingService } from "../../src/modules/routing/analysis.routing.service";

/**
 * That no analysis can see a row outside the scope it was given.
 *
 * The guard on the statements is a text check and cannot prove a predicate
 * works. This proves it, against a real engine: three fixtures that differ only
 * in which project and which group they belong to, and every analysis run as a
 * caller entitled to exactly one of them.
 *
 * Self-skips without a reachable graph database, like the other integration
 * suites.
 */

const BOLT = process.env.GRAPH_DB_URI ?? "bolt://localhost:7687";

/** A label of its own, so the fixture can be removed without touching real rows. */
const FIXTURE = "IsolationFixture";

const MINE = {
  projectId: "aaaaaaaa-0000-4000-8000-000000000001",
  groupId: "bbbbbbbb-0000-4000-8000-000000000001",
};
const OTHER_PROJECT = {
  projectId: "aaaaaaaa-0000-4000-8000-000000000002",
  groupId: "bbbbbbbb-0000-4000-8000-000000000001",
};
const OTHER_GROUP = {
  projectId: MINE.projectId,
  groupId: "bbbbbbbb-0000-4000-8000-000000000002",
};

/** The caller: entitled to one project and one group inside it. */
const SCOPE = {
  projectId: MINE.projectId,
  readableGroups: [MINE.groupId],
};

const ORG = "cccccccc-0000-4000-8000-000000000001";

type Session = ProjectionSessionService;

async function available(): Promise<boolean> {
  const probe = createDriver(BOLT);
  try {
    await probe.verifyConnectivity();
    return true;
  } catch {
    return false;
  } finally {
    await probe.close();
  }
}

const reachable = await available();

describe.skipIf(!reachable)("scope isolation (integration)", () => {
  let driver: ReturnType<typeof createDriver>;
  let session: Session;
  let cypher: CypherQueryService;

  /** Two spaces joined by a passage, plus a storey containing them. */
  const seed = (
    scope: { groupId: string; projectId: string },
    tag: string
  ) => ({
    text: `
      CREATE (s:Node:${FIXTURE} {id: $storey, orgId: $orgId, projectId: $projectId,
        groupId: $groupId, class: 'storey', name: $tag, type: 'object', version: '1'})
      CREATE (a:Node:${FIXTURE} {id: $a, orgId: $orgId, projectId: $projectId,
        groupId: $groupId, class: 'space.room', name: $tag + '-a', type: 'object',
        version: '1', parentId: $storey, programme: {use: 'office', egressRole: 'exit'}})
      CREATE (b:Node:${FIXTURE} {id: $b, orgId: $orgId, projectId: $projectId,
        groupId: $groupId, class: 'space.room', name: $tag + '-b', type: 'object',
        version: '1', parentId: $storey, programme: {use: 'plant'}})
      CREATE (a)-[:CONNECTS_TO {id: $edge, orgId: $orgId, projectId: $projectId,
        groupId: $groupId, length: 5.0}]->(b)
      CREATE (a)-[:ADJACENT_TO {id: $edge2, orgId: $orgId, projectId: $projectId,
        groupId: $groupId}]->(b)
      CREATE (s)-[:CONTAINS {id: $edge3, orgId: $orgId, projectId: $projectId,
        groupId: $groupId}]->(a)`,
    params: {
      ...scope,
      orgId: ORG,
      tag,
      storey: `${tag}-storey`,
      a: `${tag}-a`,
      b: `${tag}-b`,
      edge: `${tag}-e1`,
      edge2: `${tag}-e2`,
      edge3: `${tag}-e3`,
    },
  });

  beforeAll(async () => {
    driver = createDriver(BOLT);
    session = new ProjectionSessionService(driver, new MemgraphDialect());
    cypher = new CypherQueryService(session);

    const write = driver.session();
    try {
      await write.run(`MATCH (n:${FIXTURE}) DETACH DELETE n`);
      for (const [scope, tag] of [
        [MINE, "mine"],
        [OTHER_PROJECT, "otherproject"],
        [OTHER_GROUP, "othergroup"],
      ] as const) {
        const statement = seed(scope, tag);
        await write.run(statement.text, statement.params);
      }
    } finally {
      await write.close();
    }
  });

  afterAll(async () => {
    const write = driver.session();
    try {
      await write.run(`MATCH (n:${FIXTURE}) DETACH DELETE n`);
    } finally {
      await write.close();
      await driver.close();
    }
  });

  /** Nothing an analysis returns may name a fixture from another scope. */
  const isMine = (id: unknown) => String(id).startsWith("mine-");

  it("seeded three scopes that differ only in project and group", async () => {
    const rows = await session.read({
      text: `MATCH (n:${FIXTURE}) RETURN count(n) AS n`,
      params: {},
    });
    expect(rows[0]?.get("n").low).toBe(9);
  });

  it("connectivity sees only its own project and group", async () => {
    const answer = await new AnalysisConnectivityService(cypher).analyse(
      SCOPE,
      {}
    );
    // Two rooms, joined: one island. The other four rooms are invisible.
    expect(answer.spaces).toBe(2);
    expect(answer.connected).toBe(true);
  });

  it("chokepoints sees only its own", async () => {
    const answer = await new AnalysisChokepointsService(cypher).analyse(
      SCOPE,
      {}
    );
    expect(answer.examined).toBe(2);
    for (const passage of answer.passages) {
      expect(isMine(passage.fromId)).toBe(true);
      expect(isMine(passage.toId)).toBe(true);
    }
  });

  it("adjacency sees only its own", async () => {
    const answer = await new AnalysisAdjacencyService(cypher).analyse(SCOPE, {
      differingUseOnly: false,
    });
    expect(answer.examined).toBe(2);
    expect(answer.pairs).toHaveLength(1);
    for (const pair of answer.pairs) {
      expect(isMine(pair.aId)).toBe(true);
      expect(isMine(pair.bId)).toBe(true);
    }
  });

  it("containment sees only its own", async () => {
    const answer = await new AnalysisContainmentService(cypher).analyse(SCOPE, {
      classes: ["space", "storey"],
    });
    // Two rooms and one storey from this scope, and nothing from the others.
    expect(answer.examined).toBe(3);
    for (const orphan of answer.orphans) {
      expect(isMine(orphan)).toBe(true);
    }
  });

  it("egress sees only its own", async () => {
    const answer = await new AnalysisEgressService(cypher).analyse(SCOPE, {});
    expect(answer.exits).toBe(1);
    // One exit and one room that reaches it; four rooms elsewhere are not counted.
    expect(answer.examined).toBe(1);
    for (const entry of answer.furthest) {
      expect(isMine(entry.nodeId)).toBe(true);
      expect(isMine(entry.exitId)).toBe(true);
    }
  });

  it("routing refuses to reach a node in another project", async () => {
    const answer = await new AnalysisRoutingService(cypher).analyse(SCOPE, {
      fromId: "mine-a",
      toId: "otherproject-b",
    });
    expect(answer.reachable).toBe(false);
  });

  it("routing refuses to reach a node in an unreadable group", async () => {
    const answer = await new AnalysisRoutingService(cypher).analyse(SCOPE, {
      fromId: "mine-a",
      toId: "othergroup-b",
    });
    expect(answer.reachable).toBe(false);
  });

  it("routing works within the caller's own scope, so the refusals mean something", async () => {
    const answer = await new AnalysisRoutingService(cypher).analyse(SCOPE, {
      fromId: "mine-a",
      toId: "mine-b",
    });
    expect(answer.reachable).toBe(true);
  });

  it("a caller entitled to no group sees nothing at all", async () => {
    const nothing = { projectId: MINE.projectId, readableGroups: [] };
    const answer = await new AnalysisConnectivityService(cypher).analyse(
      nothing,
      {}
    );
    // An empty readable set has to match nothing rather than everything.
    expect(answer.spaces).toBe(0);
  });

  it("a caller entitled to the other group sees only that group", async () => {
    const theirs = {
      projectId: OTHER_GROUP.projectId,
      readableGroups: [OTHER_GROUP.groupId],
    };
    const answer = await new AnalysisChokepointsService(cypher).analyse(
      theirs,
      {}
    );
    expect(answer.examined).toBe(2);
    for (const passage of answer.passages) {
      expect(String(passage.fromId).startsWith("othergroup-")).toBe(true);
    }
  });
});
