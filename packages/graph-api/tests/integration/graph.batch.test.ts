import { randomUUID } from "node:crypto";
import { graphNode, graphVersion } from "@aec-craft/platform-graph-api";
import {
  buildServices,
  createNode,
  dbAvailable,
  makeOrg,
  makeProject,
  makeUser,
  orgScope,
  projectScope,
  resetSeq,
  useTestDb,
} from "@aec-craft/platform-testing";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { GraphBatchErrors } from "../../src/modules/batch/graph.batch.errors";
import { GraphEdgeErrors } from "../../src/modules/edges/graph.edge.errors";
import { GraphNodeErrors } from "../../src/modules/nodes/graph.node.errors";

/**
 * Batch-specific behavior of the transactional changeset (`GraphBatchService`):
 * atomicity, cross-kind ordering, intra-batch references, upsert idempotency,
 * id conflicts, the edge-onto-deleted-node guard, scope-strictness, and the
 * per-kind summary counts. Per-op semantics (parent/cycle/endpoint rules,
 * versioning) are covered by the node/edge service tests.
 */
describe.skipIf(!dbAvailable())("GraphBatchService (integration)", () => {
  const ctx = useTestDb();

  it("applies nodes and edges in one call, edge referencing a node created in the same changeset", async () => {
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

    const aId = randomUUID();
    const bId = randomUUID();
    const res = await services.batch.applyChangeset(scope, {
      nodes: [
        {
          op: "create",
          id: aId,
          type: "object",
          class: "building.storey",
          name: "S",
        },
        {
          op: "create",
          id: bId,
          type: "object",
          class: "space.residential.kitchen",
          name: "K",
        },
      ],
      edges: [{ op: "create", sourceId: aId, targetId: bId, type: "contains" }],
    });

    expect(res.nodes.summary).toMatchObject({
      created: 2,
      updated: 0,
      deleted: 0,
      skipped: 0,
    });
    expect(res.edges.summary).toMatchObject({
      created: 1,
      updated: 0,
      deleted: 0,
      skipped: 0,
    });
    expect(res.nodes.items.map((n) => n.id).sort()).toEqual([aId, bId].sort());
    expect(res.edges.items[0]).toMatchObject({
      sourceId: aId,
      targetId: bId,
      type: "contains",
    });
  });

  it("is atomic: a failing op rolls back the writes that already ran in the same call", async () => {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const owner = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const scope = await orgScope(services, org.id);

    const aId = randomUUID();
    await expect(
      services.batch.applyChangeset(scope, {
        nodes: [
          {
            op: "create",
            id: aId,
            type: "object",
            class: "building.storey",
            name: "S",
          },
        ],
        // self-loop: rejected during the edge-write phase, after the node insert.
        edges: [
          { op: "create", sourceId: aId, targetId: aId, type: "contains" },
        ],
      })
    ).rejects.toMatchObject({ code: GraphEdgeErrors.SELF_LOOP.code });

    const rows = await ctx.db
      .select()
      .from(graphNode)
      .where(eq(graphNode.id, aId));
    expect(rows).toHaveLength(0);
    expect(await ctx.db.select().from(graphVersion)).toHaveLength(0);
  });

  it("upsert with unchanged content is skipped (no version bump, counted as skipped)", async () => {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const owner = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const scope = await orgScope(services, org.id);
    const id = randomUUID();
    const fields = {
      type: "object",
      class: "building.storey",
      name: "S",
    } as const;

    await services.batch.applyChangeset(scope, {
      nodes: [{ op: "create", id, ...fields }],
      edges: [],
    });
    const res = await services.batch.applyChangeset(scope, {
      nodes: [{ op: "upsert", id, ...fields }],
      edges: [],
    });

    expect(res.nodes.summary).toMatchObject({
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 1,
    });
    expect(res.nodes.items[0]?.version).toBe("1");

    const versions = await ctx.db
      .select()
      .from(graphVersion)
      .where(eq(graphVersion.entityId, id));
    expect(versions).toHaveLength(1);
    expect(versions[0]?.op).toBe("created");
  });

  it("upsert with changed content replaces and bumps the version", async () => {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const owner = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const scope = await orgScope(services, org.id);
    const id = randomUUID();

    await services.batch.applyChangeset(scope, {
      nodes: [
        {
          op: "create",
          id,
          type: "object",
          class: "building.storey",
          name: "S",
        },
      ],
      edges: [],
    });
    const res = await services.batch.applyChangeset(scope, {
      nodes: [
        {
          op: "upsert",
          id,
          type: "object",
          class: "building.storey",
          name: "S renamed",
        },
      ],
      edges: [],
    });

    expect(res.nodes.summary).toMatchObject({
      created: 0,
      updated: 1,
      skipped: 0,
    });
    expect(res.nodes.items[0]).toMatchObject({
      name: "S renamed",
      version: "2",
    });
  });

  it("create with an already-existing id is GRAPH_NODE_BATCH_ID_CONFLICT", async () => {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const owner = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const scope = await orgScope(services, org.id);
    const id = randomUUID();

    await services.batch.applyChangeset(scope, {
      nodes: [
        {
          op: "create",
          id,
          type: "object",
          class: "building.storey",
          name: "S",
        },
      ],
      edges: [],
    });
    await expect(
      services.batch.applyChangeset(scope, {
        nodes: [
          {
            op: "create",
            id,
            type: "object",
            class: "building.storey",
            name: "S2",
          },
        ],
        edges: [],
      })
    ).rejects.toMatchObject({ code: GraphNodeErrors.BATCH_ID_CONFLICT.code });
  });

  it("rejects an edge write onto a node the same changeset deletes", async () => {
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
      class: "building.storey",
      name: "S",
    });
    const b = await createNode(services, scope, {
      type: "object",
      class: "space.residential.kitchen",
      name: "K",
    });

    await expect(
      services.batch.applyChangeset(scope, {
        nodes: [{ op: "delete", id: a.id }],
        edges: [
          { op: "create", sourceId: a.id, targetId: b.id, type: "contains" },
        ],
      })
    ).rejects.toMatchObject({
      code: GraphBatchErrors.EDGE_ENDPOINT_DELETED.code,
    });

    // Nothing applied: the node is still there.
    await services.nodes.findById(scope, a.id);
  });

  it("is scope-strict: update/delete of a row outside the changeset scope is NOT_FOUND", async () => {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const owner = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const project = await makeProject(services, org.id, owner.principal);
    const orgNode = await createNode(
      services,
      await orgScope(services, org.id),
      { type: "source", class: "source.law.lbo_bw", name: "§34" }
    );
    const pScope = await projectScope(services, project.id);

    await expect(
      services.batch.applyChangeset(pScope, {
        nodes: [{ op: "update", id: orgNode.id, name: "Tampered" }],
        edges: [],
      })
    ).rejects.toMatchObject({ code: GraphNodeErrors.NOT_FOUND.code });

    await expect(
      services.batch.applyChangeset(pScope, {
        nodes: [{ op: "delete", id: orgNode.id }],
        edges: [],
      })
    ).rejects.toMatchObject({ code: GraphNodeErrors.NOT_FOUND.code });

    const reread = await services.nodes.findById(
      await orgScope(services, org.id),
      orgNode.id
    );
    expect(reread.name).toBe("§34");
  });

  it("summarizes mixed create/upsert/update/delete with items only for writes", async () => {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const owner = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const scope = await orgScope(services, org.id);
    const toUpdate = await createNode(services, scope, {
      type: "object",
      class: "building.storey",
      name: "U",
    });
    const toDelete = await createNode(services, scope, {
      type: "object",
      class: "building.storey",
      name: "D",
    });

    const res = await services.batch.applyChangeset(scope, {
      nodes: [
        { op: "create", type: "object", class: "building.storey", name: "new" },
        {
          op: "upsert",
          id: randomUUID(),
          type: "object",
          class: "building.storey",
          name: "ups",
        },
        { op: "update", id: toUpdate.id, name: "renamed" },
        { op: "delete", id: toDelete.id },
      ],
      edges: [],
    });

    expect(res.nodes.summary).toMatchObject({
      created: 2,
      updated: 1,
      deleted: 1,
      skipped: 0,
    });
    // Deletes contribute to the summary only; writes return items in input order.
    expect(res.nodes.items).toHaveLength(3);
    expect(res.nodes.items.map((n) => n.name)).toEqual([
      "new",
      "ups",
      "renamed",
    ]);
  });
});
