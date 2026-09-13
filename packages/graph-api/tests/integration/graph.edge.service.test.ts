import { graphEdge, graphVersion } from "@aec-craft/platform-graph-api";
import {
  allGroups,
  buildServices,
  createEdge,
  createNode,
  dbAvailable,
  deleteEdge,
  deleteNode,
  makeOrg,
  makeProject,
  makeUser,
  orgScope,
  projectScope,
  resetSeq,
  updateEdge,
  useTestDb,
} from "@aec-craft/platform-testing";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { GraphEdgeErrors } from "../../src/modules/edges/graph.edge.errors";

describe.skipIf(!dbAvailable())("GraphEdgeService (integration)", () => {
  const ctx = useTestDb();

  describe("create", () => {
    it("creates an org-scoped edge between two org-scoped nodes", async () => {
      resetSeq();
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const a = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "building.storey",
        name: "Storey",
      });
      const b = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });

      const edge = await createEdge(
        services,
        await orgScope(services, org.id),
        { sourceId: a.id, targetId: b.id, type: "contains" }
      );
      expect(edge.orgId).toBe(org.id);
      expect(edge.projectId).toBeNull();
      expect(edge.sourceId).toBe(a.id);
      expect(edge.targetId).toBe(b.id);
      expect(edge.type).toBe("contains");
    });

    it("creates a project-scoped edge with one endpoint in the org library", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);
      const template = await createNode(
        services,
        await orgScope(services, org.id),
        {
          type: "object",
          class: "space.residential.bathroom",
          name: "Bathroom template",
        }
      );
      const instance = await createNode(
        services,
        await projectScope(services, project.id),
        {
          type: "object",
          class: "space.residential.bathroom",
          name: "Bad 1.02",
        }
      );

      const edge = await createEdge(
        services,
        await projectScope(services, project.id),
        { sourceId: instance.id, targetId: template.id, type: "serves" }
      );
      expect(edge.projectId).toBe(project.id);
    });

    it("rejects a self-loop", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const a = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "building.storey",
        name: "Storey",
      });
      await expect(
        createEdge(services, await orgScope(services, org.id), {
          sourceId: a.id,
          targetId: a.id,
          type: "contains",
        })
      ).rejects.toMatchObject({ code: GraphEdgeErrors.SELF_LOOP.code });
    });

    it("rejects a cross-org edge", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const a = await makeUser(ctx.db, services);
      const b = await makeUser(ctx.db, services);
      const orgA = await makeOrg(services, a.principal);
      const orgB = await makeOrg(services, b.principal);

      const nA = await createNode(services, await orgScope(services, orgA.id), {
        type: "object",
        class: "building.storey",
        name: "Storey A",
      });
      const nB = await createNode(services, await orgScope(services, orgB.id), {
        type: "object",
        class: "building.storey",
        name: "Storey B",
      });

      await expect(
        createEdge(services, await orgScope(services, orgA.id), {
          sourceId: nA.id,
          targetId: nB.id,
          type: "contains",
        })
      ).rejects.toMatchObject({ code: GraphEdgeErrors.CROSS_ORG.code });
    });

    it("rejects a cross-project edge", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const a = await makeProject(services, org.id, owner.principal);
      const b = await makeProject(services, org.id, owner.principal);

      const nA = await createNode(
        services,
        await projectScope(services, a.id),
        { type: "object", class: "space.residential.kitchen", name: "K" }
      );
      const nB = await createNode(
        services,
        await projectScope(services, b.id),
        { type: "object", class: "space.residential.bathroom", name: "Bath" }
      );

      await expect(
        createEdge(services, await projectScope(services, a.id), {
          sourceId: nA.id,
          targetId: nB.id,
          type: "contains",
        })
      ).rejects.toMatchObject({ code: GraphEdgeErrors.CROSS_PROJECT.code });
    });

    it("rejects an org-scoped edge when an endpoint is project-scoped", async () => {
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
        { type: "object", class: "building.storey", name: "S" }
      );
      const projectNode = await createNode(
        services,
        await projectScope(services, project.id),
        { type: "object", class: "space.residential.kitchen", name: "K" }
      );

      await expect(
        createEdge(services, await orgScope(services, org.id), {
          sourceId: orgNode.id,
          targetId: projectNode.id,
          type: "contains",
        })
      ).rejects.toMatchObject({ code: GraphEdgeErrors.TARGET_NOT_FOUND.code });
    });

    it("accepts a non-canonical edge type, counter increments", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);

      const a = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "building.storey",
        name: "S",
      });
      const b = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });
      const edge = await createEdge(
        services,
        await orgScope(services, org.id),
        { sourceId: a.id, targetId: b.id, type: "weird_link" }
      );
      expect(edge.type).toBe("weird_link");
      const hits = Array.from(
        services.graphVocabulary.getCounters().keys()
      ).filter((k) => k.startsWith("edge_type|weird_link|"));
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  describe("list", () => {
    it("project endpoint hydrates: returns project + visible org edges", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);

      const orgA = await createNode(
        services,
        await orgScope(services, org.id),
        { type: "object", class: "building.storey", name: "S" }
      );
      const orgB = await createNode(
        services,
        await orgScope(services, org.id),
        { type: "object", class: "space.residential.kitchen", name: "K" }
      );
      const orgEdge = await createEdge(
        services,
        await orgScope(services, org.id),
        { sourceId: orgA.id, targetId: orgB.id, type: "contains" }
      );

      const pA = await createNode(
        services,
        await projectScope(services, project.id),
        { type: "object", class: "space.residential.bathroom", name: "Bad" }
      );
      const pB = await createNode(
        services,
        await projectScope(services, project.id),
        { type: "object", class: "element.wall", name: "W" }
      );
      const projectEdge = await createEdge(
        services,
        await projectScope(services, project.id),
        { sourceId: pB.id, targetId: pA.id, type: "bounds" }
      );

      const page = await services.edges.list(
        await projectScope(services, project.id),
        {},
        await allGroups(services)
      );
      expect(page.items.map((e) => e.id).sort()).toEqual(
        [orgEdge.id, projectEdge.id].sort()
      );

      const onlyProject = await services.edges.list(
        await projectScope(services, project.id),
        { scope: "project" },
        await allGroups(services)
      );
      expect(onlyProject.items.map((e) => e.id)).toEqual([projectEdge.id]);
    });

    it("filters by type, sourceId, targetId", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const a = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "building.storey",
        name: "S",
      });
      const b = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });
      const c = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "space.residential.bathroom",
        name: "B",
      });
      const e1 = await createEdge(services, await orgScope(services, org.id), {
        sourceId: a.id,
        targetId: b.id,
        type: "contains",
      });
      await createEdge(services, await orgScope(services, org.id), {
        sourceId: a.id,
        targetId: c.id,
        type: "contains",
      });

      const bySource = await services.edges.list(
        await orgScope(services, org.id),
        { sourceId: a.id, targetId: b.id },
        await allGroups(services)
      );
      expect(bySource.items.map((e) => e.id)).toEqual([e1.id]);
    });
  });

  describe("update", () => {
    it("scope-strict: project endpoint does NOT mutate an org-scoped edge", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);
      const a = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "building.storey",
        name: "S",
      });
      const b = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });
      const edge = await createEdge(
        services,
        await orgScope(services, org.id),
        { sourceId: a.id, targetId: b.id, type: "contains" }
      );

      await expect(
        updateEdge(
          services,
          await projectScope(services, project.id),
          edge.id,
          {
            type: "serves",
          }
        )
      ).rejects.toMatchObject({ code: GraphEdgeErrors.NOT_FOUND.code });

      const reread = await services.edges.findById(
        await orgScope(services, org.id),
        edge.id
      );
      expect(reread.type).toBe("contains");
    });

    it("bumps version", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const a = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "building.storey",
        name: "S",
      });
      const b = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });
      const edge = await createEdge(
        services,
        await orgScope(services, org.id),
        { sourceId: a.id, targetId: b.id, type: "contains" }
      );
      const updated = await updateEdge(
        services,
        await orgScope(services, org.id),
        edge.id,
        {
          properties: {
            interop: { ifcRel: "IfcRelContainedInSpatialStructure" },
          },
        }
      );
      expect(Number(updated.version)).toBeGreaterThan(Number(edge.version));
      expect(updated.properties).toEqual({
        interop: { ifcRel: "IfcRelContainedInSpatialStructure" },
      });
    });
  });

  describe("delete", () => {
    it("scope-strict: project endpoint does NOT delete an org-scoped edge", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);
      const a = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "building.storey",
        name: "S",
      });
      const b = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });
      const edge = await createEdge(
        services,
        await orgScope(services, org.id),
        { sourceId: a.id, targetId: b.id, type: "contains" }
      );

      await expect(
        deleteEdge(services, await projectScope(services, project.id), edge.id)
      ).rejects.toMatchObject({ code: GraphEdgeErrors.NOT_FOUND.code });

      await services.edges.findById(await orgScope(services, org.id), edge.id);
    });

    it("cascades when an endpoint node is deleted", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const a = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "building.storey",
        name: "S",
      });
      const b = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });
      const edge = await createEdge(
        services,
        await orgScope(services, org.id),
        { sourceId: a.id, targetId: b.id, type: "contains" }
      );

      await deleteNode(services, await orgScope(services, org.id), a.id);
      await expect(
        services.edges.findById(await orgScope(services, org.id), edge.id)
      ).rejects.toMatchObject({ code: GraphEdgeErrors.NOT_FOUND.code });
    });
  });

  describe("versioning", () => {
    /** Two org-scoped endpoint nodes, fresh per test. */
    async function makeEndpoints(services: ReturnType<typeof buildServices>) {
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
      return { owner, org, scope, a, b };
    }

    it("create writes exactly one graph_version row (actorId null by default)", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const { org, scope, a, b } = await makeEndpoints(services);

      const edge = await createEdge(services, scope, {
        sourceId: a.id,
        targetId: b.id,
        type: "adjacentTo",
        properties: { length: 1.2, passable: true },
      });

      const rows = await ctx.db
        .select()
        .from(graphVersion)
        .where(eq(graphVersion.entityId, edge.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        entityType: "edge",
        op: "created",
        version: "1",
        orgId: org.id,
        projectId: null,
        actorId: null,
      });
      expect(rows[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
      const snapshot = rows[0]!.snapshot!;
      expect(snapshot.id).toBe(edge.id);
      expect(snapshot.sourceId).toBe(a.id);
      expect(snapshot.targetId).toBe(b.id);
      expect(snapshot.properties).toEqual({ length: 1.2, passable: true });
    });

    it("create records an explicit actorId", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const { owner, scope, a, b } = await makeEndpoints(services);

      const edge = await createEdge(
        services,
        scope,
        { sourceId: a.id, targetId: b.id, type: "adjacentTo" },
        owner.principal
      );

      const rows = await ctx.db
        .select()
        .from(graphVersion)
        .where(eq(graphVersion.entityId, edge.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.actorId).toBe(owner.id);
    });

    it("update bumps version to '2' and writes one 'updated' row with the post-state snapshot", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const { scope, a, b } = await makeEndpoints(services);
      const edge = await createEdge(services, scope, {
        sourceId: a.id,
        targetId: b.id,
        type: "adjacentTo",
        properties: { length: 1.2 },
      });

      const updated = await updateEdge(services, scope, edge.id, {
        properties: { length: 2.4, passable: false },
      });
      expect(updated.version).toBe("2");

      const rows = await ctx.db
        .select()
        .from(graphVersion)
        .where(
          and(
            eq(graphVersion.entityId, edge.id),
            eq(graphVersion.op, "updated")
          )
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.version).toBe("2");
      expect(rows[0]!.snapshot!.properties).toEqual({
        length: 2.4,
        passable: false,
      });
    });

    it("no-op update returns version '1' and writes no version row", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const { scope, a, b } = await makeEndpoints(services);
      const edge = await createEdge(services, scope, {
        sourceId: a.id,
        targetId: b.id,
        type: "adjacentTo",
        properties: { length: 1.2 },
      });

      const unchanged = await updateEdge(services, scope, edge.id, {
        type: "adjacentTo",
        properties: { length: 1.2 },
      });
      expect(unchanged.version).toBe("1");

      const rows = await ctx.db
        .select()
        .from(graphVersion)
        .where(eq(graphVersion.entityId, edge.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.op).toBe("created");
    });

    it("delete writes one tombstone (NULL snapshot/hash, version = last version)", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const { org, scope, a, b } = await makeEndpoints(services);
      const edge = await createEdge(services, scope, {
        sourceId: a.id,
        targetId: b.id,
        type: "adjacentTo",
      });
      await updateEdge(services, scope, edge.id, {
        properties: { length: 9.9 },
      });
      await deleteEdge(services, scope, edge.id);

      const rows = await ctx.db
        .select()
        .from(graphVersion)
        .where(
          and(
            eq(graphVersion.entityId, edge.id),
            eq(graphVersion.op, "deleted")
          )
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        entityType: "edge",
        version: "2",
        orgId: org.id,
        contentHash: null,
        snapshot: null,
      });
    });

    it("rolls back the edge insert when the version write fails (atomicity)", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const { scope, a, b } = await makeEndpoints(services);
      const spy = vi
        .spyOn(services.graphVersions, "record")
        .mockRejectedValueOnce(new Error("version write failed"));

      await expect(
        createEdge(services, scope, {
          sourceId: a.id,
          targetId: b.id,
          type: "adjacentTo",
        })
      ).rejects.toThrow("version write failed");
      spy.mockRestore();

      expect(await ctx.db.select().from(graphEdge)).toHaveLength(0);
      // Only the two endpoint-node version rows remain; the edge event rolled back.
      const versions = await ctx.db.select().from(graphVersion);
      expect(versions.map((r) => r.entityType)).toEqual(["node", "node"]);
    });
  });
});
