import {
  graphEdge,
  graphNode,
  graphVersion,
} from "@aec-craft/platform-graph-api";
import {
  allGroups,
  buildServices,
  createEdge,
  createNode,
  dbAvailable,
  deleteNode,
  makeOrg,
  makeProject,
  makeUser,
  orgScope,
  projectScope,
  resetSeq,
  updateNode,
  useTestDb,
} from "@aec-craft/platform-testing";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { GraphNodeErrors } from "../../src/modules/nodes/graph.node.errors";

describe.skipIf(!dbAvailable())("GraphNodeService (integration)", () => {
  const ctx = useTestDb();

  describe("create", () => {
    it("creates an org-scoped node", async () => {
      resetSeq();
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);

      const node = await createNode(
        services,
        await orgScope(services, org.id),
        {
          type: "source",
          class: "source.law.lbo_bw",
          name: "§34 LBO BW",
          properties: { interop: { url: "https://example.test/lbo_bw" } },
        }
      );
      expect(node.orgId).toBe(org.id);
      expect(node.projectId).toBeNull();
      expect(node.type).toBe("source");
      expect(node.class).toBe("source.law.lbo_bw");
      expect(node.version).toBe("1");
      expect(node.parentId).toBeNull();
      expect(node.phase).toBeNull();
      expect(node.propertyKeys).toEqual(["interop"]);
    });

    it("creates a project-scoped node with phase and parent", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);

      const parent = await createNode(
        services,
        await projectScope(services, project.id),
        {
          type: "object",
          class: "building.storey",
          name: "Storey 1",
          phase: "design",
        }
      );
      const child = await createNode(
        services,
        await projectScope(services, project.id),
        {
          type: "object",
          class: "space.residential.bathroom",
          name: "Bad 1.02",
          parentId: parent.id,
          phase: "design",
        }
      );
      expect(child.projectId).toBe(project.id);
      expect(child.parentId).toBe(parent.id);
      expect(child.phase).toBe("design");
    });

    it("allows a project-scoped node to parent to an org-scoped node", async () => {
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
          parentId: template.id,
        }
      );
      expect(instance.parentId).toBe(template.id);
    });

    it("rejects an org-scoped node with a project-scoped parent", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);

      const projectNode = await createNode(
        services,
        await projectScope(services, project.id),
        { type: "object", class: "space.residential.kitchen", name: "Kitchen" }
      );
      await expect(
        createNode(services, await orgScope(services, org.id), {
          type: "object",
          class: "space.residential.kitchen",
          name: "Bad parent",
          parentId: projectNode.id,
        })
      ).rejects.toMatchObject({
        code: GraphNodeErrors.PARENT_CROSS_SCOPE.code,
      });
    });

    it("rejects a project-scoped node with a sibling-project parent", async () => {
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

      const siblingNode = await createNode(
        services,
        await projectScope(services, a.id),
        { type: "object", class: "space.residential.kitchen", name: "Kitchen" }
      );
      await expect(
        createNode(services, await projectScope(services, b.id), {
          type: "object",
          class: "space.residential.bathroom",
          name: "Bath",
          parentId: siblingNode.id,
        })
      ).rejects.toMatchObject({
        code: GraphNodeErrors.PARENT_CROSS_SCOPE.code,
      });
    });

    it("rejects a missing parent", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);

      await expect(
        createNode(services, await orgScope(services, org.id), {
          type: "object",
          class: "space.residential.kitchen",
          name: "Orphan",
          parentId: "00000000-0000-0000-0000-000000000000",
        })
      ).rejects.toMatchObject({ code: GraphNodeErrors.PARENT_NOT_FOUND.code });
    });

    it("default vocabulary: accepts a non-canonical node type, counter increments", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);

      const before = services.graphVocabulary.getCounters().size;
      const node = await createNode(
        services,
        await orgScope(services, org.id),
        {
          type: "experiment_kind",
          class: "space.residential.kitchen",
          name: "Foo",
        }
      );
      expect(node.type).toBe("experiment_kind");
      const after = services.graphVocabulary.getCounters();
      expect(after.size).toBeGreaterThan(before);
    });

    it("accepts a non-canonical class root, counter increments", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);

      const node = await createNode(
        services,
        await orgScope(services, org.id),
        { type: "object", class: "weird.kitchen", name: "Foo" }
      );
      expect(node.class).toBe("weird.kitchen");
      const hits = Array.from(
        services.graphVocabulary.getCounters().keys()
      ).filter((k) => k.startsWith("class_root|weird|"));
      expect(hits.length).toBeGreaterThan(0);
    });

    it("accepts a non-canonical block key, counter increments", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);

      const node = await createNode(
        services,
        await orgScope(services, org.id),
        {
          type: "object",
          class: "space.residential.kitchen",
          name: "Foo",
          properties: { weirdBlock: { x: 1 } },
        }
      );
      expect(node.properties).toEqual({ weirdBlock: { x: 1 } });
      const hits = Array.from(
        services.graphVocabulary.getCounters().keys()
      ).filter((k) => k.startsWith("block_key|weirdBlock|"));
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  describe("list", () => {
    it("org scope returns org-scoped only", async () => {
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
        {
          type: "source",
          class: "source.norm.din_4109",
          name: "DIN 4109",
        }
      );
      await createNode(services, await projectScope(services, project.id), {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });

      const page = await services.nodes.list(
        await orgScope(services, org.id),
        {},
        await allGroups(services)
      );
      expect(page.items.map((n) => n.id)).toEqual([orgNode.id]);
    });

    it("project scope hydrates: returns project + visible org rows by default", async () => {
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
        {
          type: "source",
          class: "source.norm.din_4109",
          name: "DIN 4109",
        }
      );
      const projectNode = await createNode(
        services,
        await projectScope(services, project.id),
        { type: "object", class: "space.residential.kitchen", name: "K" }
      );

      const page = await services.nodes.list(
        await projectScope(services, project.id),
        {},
        await allGroups(services)
      );
      expect(page.items.map((n) => n.id).sort()).toEqual(
        [orgNode.id, projectNode.id].sort()
      );
    });

    it("?scope=project narrows to project-only", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);

      await createNode(services, await orgScope(services, org.id), {
        type: "source",
        class: "source.norm.din_4109",
        name: "DIN 4109",
      });
      const projectNode = await createNode(
        services,
        await projectScope(services, project.id),
        { type: "object", class: "space.residential.kitchen", name: "K" }
      );

      const page = await services.nodes.list(
        await projectScope(services, project.id),
        { scope: "project" },
        await allGroups(services)
      );
      expect(page.items.map((n) => n.id)).toEqual([projectNode.id]);
    });

    it("?scope=org narrows to inherited library only", async () => {
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
        {
          type: "source",
          class: "source.norm.din_4109",
          name: "DIN 4109",
        }
      );
      await createNode(services, await projectScope(services, project.id), {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });

      const page = await services.nodes.list(
        await projectScope(services, project.id),
        { scope: "org" },
        await allGroups(services)
      );
      expect(page.items.map((n) => n.id)).toEqual([orgNode.id]);
    });

    it("filters by type, class (eq + startsWith + in), phase, parentId, JSONB hasKey", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);

      const k = await createNode(
        services,
        await projectScope(services, project.id),
        {
          type: "object",
          class: "space.residential.kitchen",
          name: "K",
          phase: "design",
          properties: { envelope: { netArea: 12.5 } },
        }
      );
      const b = await createNode(
        services,
        await projectScope(services, project.id),
        { type: "object", class: "space.residential.bathroom", name: "B" }
      );
      const r = await createNode(
        services,
        await projectScope(services, project.id),
        { type: "rule", class: "rule.energy", name: "R" }
      );

      const scope = await projectScope(services, project.id);

      const byClass = await services.nodes.list(
        scope,
        {
          class: "eq.space.residential.kitchen",
        },
        await allGroups(services)
      );
      expect(byClass.items.map((n) => n.id)).toEqual([k.id]);

      const byPrefix = await services.nodes.list(
        scope,
        {
          class: "startsWith.space.",
        },
        await allGroups(services)
      );
      expect(byPrefix.items.map((n) => n.id).sort()).toEqual(
        [k.id, b.id].sort()
      );

      const byTypeIn = await services.nodes.list(
        scope,
        {
          type: "in.(object,rule)",
        },
        await allGroups(services)
      );
      expect(byTypeIn.items.map((n) => n.id).sort()).toEqual(
        [k.id, b.id, r.id].sort()
      );

      const byPhase = await services.nodes.list(
        scope,
        { phase: "eq.design" },
        await allGroups(services)
      );
      expect(byPhase.items.map((n) => n.id)).toEqual([k.id]);

      const byProp = await services.nodes.list(
        scope,
        {
          properties: "hasKey.envelope",
        },
        await allGroups(services)
      );
      expect(byProp.items.map((n) => n.id)).toEqual([k.id]);

      const all = await services.nodes.list(
        scope,
        {},
        await allGroups(services)
      );
      expect(all.items.map((n) => n.id).sort()).toEqual(
        [k.id, b.id, r.id].sort()
      );
    });
  });

  describe("findById", () => {
    it("project scope finds an org-scoped node by id (hydrated)", async () => {
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

      const got = await services.nodes.findById(
        await projectScope(services, project.id),
        orgNode.id
      );
      expect(got.id).toBe(orgNode.id);
      expect(got.projectId).toBeNull();
    });

    it("project projection trims missing keys to null", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);
      const node = await createNode(
        services,
        await projectScope(services, project.id),
        {
          type: "object",
          class: "space.residential.kitchen",
          name: "K",
          properties: { envelope: { netArea: 10 } },
        }
      );

      const got = await services.nodes.findById(
        await projectScope(services, project.id),
        node.id,
        ["envelope", "geometry"]
      );
      expect(got.properties).toEqual({
        envelope: { netArea: 10 },
        geometry: null,
      });
    });

    it("404 on unknown id", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      await expect(
        services.nodes.findById(
          await orgScope(services, org.id),
          "00000000-0000-0000-0000-000000000000"
        )
      ).rejects.toMatchObject({ code: GraphNodeErrors.NOT_FOUND.code });
    });
  });

  describe("update", () => {
    it("bumps version and overrides phase", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const node = await createNode(
        services,
        await orgScope(services, org.id),
        {
          type: "object",
          class: "space.residential.kitchen",
          name: "K",
          phase: "design",
        }
      );

      const updated = await updateNode(
        services,
        await orgScope(services, org.id),
        node.id,
        {
          phase: "construction",
          name: "K renamed",
        }
      );
      expect(updated.phase).toBe("construction");
      expect(updated.name).toBe("K renamed");
      expect(Number(updated.version)).toBeGreaterThan(Number(node.version));
    });

    it("scope-strict: project endpoint will NOT mutate an org-scoped row", async () => {
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

      await expect(
        updateNode(
          services,
          await projectScope(services, project.id),
          orgNode.id,
          { name: "Tampered" }
        )
      ).rejects.toMatchObject({ code: GraphNodeErrors.NOT_FOUND.code });

      const reread = await services.nodes.findById(
        await orgScope(services, org.id),
        orgNode.id
      );
      expect(reread.name).toBe("§34");
    });

    it("rejects a parent that would form a cycle", async () => {
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
        class: "space.residential.kitchen",
        name: "A",
      });
      const b = await createNode(services, await orgScope(services, org.id), {
        type: "object",
        class: "space.residential.kitchen",
        name: "B",
        parentId: a.id,
      });

      await expect(
        updateNode(services, await orgScope(services, org.id), a.id, {
          parentId: b.id,
        })
      ).rejects.toMatchObject({ code: GraphNodeErrors.PARENT_CYCLE.code });
    });
  });

  describe("delete", () => {
    it("scope-strict: project endpoint will NOT delete an org-scoped row", async () => {
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

      await expect(
        deleteNode(
          services,
          await projectScope(services, project.id),
          orgNode.id
        )
      ).rejects.toMatchObject({ code: GraphNodeErrors.NOT_FOUND.code });

      // still there
      await services.nodes.findById(
        await orgScope(services, org.id),
        orgNode.id
      );
    });

    it("deletes via the matching scope", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const node = await createNode(
        services,
        await orgScope(services, org.id),
        { type: "object", class: "space.residential.kitchen", name: "K" }
      );
      await deleteNode(services, await orgScope(services, org.id), node.id);
      await expect(
        services.nodes.findById(await orgScope(services, org.id), node.id)
      ).rejects.toMatchObject({ code: GraphNodeErrors.NOT_FOUND.code });
    });
  });

  describe("versioning", () => {
    it("create writes exactly one graph_version row (actorId null by default)", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);

      const node = await createNode(
        services,
        await projectScope(services, project.id),
        {
          type: "object",
          class: "space.residential.kitchen",
          name: "K",
          properties: { envelope: { netArea: 12.5 } },
        }
      );

      const rows = await ctx.db
        .select()
        .from(graphVersion)
        .where(eq(graphVersion.entityId, node.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        entityType: "node",
        op: "created",
        version: "1",
        orgId: org.id,
        projectId: project.id,
        actorId: null,
      });
      expect(rows[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
      const snapshot = rows[0]!.snapshot!;
      expect(snapshot.id).toBe(node.id);
      expect(snapshot.name).toBe("K");
      expect(snapshot.properties).toEqual({ envelope: { netArea: 12.5 } });
    });

    it("create records an explicit actorId", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);

      const node = await createNode(
        services,
        await orgScope(services, org.id),
        { type: "object", class: "space.residential.kitchen", name: "K" },
        owner.principal
      );

      const rows = await ctx.db
        .select()
        .from(graphVersion)
        .where(eq(graphVersion.entityId, node.id));
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
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const scope = await orgScope(services, org.id);
      const node = await createNode(services, scope, {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });

      const updated = await updateNode(services, scope, node.id, {
        name: "K renamed",
      });
      expect(updated.version).toBe("2");

      const rows = await ctx.db
        .select()
        .from(graphVersion)
        .where(
          and(
            eq(graphVersion.entityId, node.id),
            eq(graphVersion.op, "updated")
          )
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.version).toBe("2");
      expect(rows[0]!.snapshot!.name).toBe("K renamed");
    });

    it("no-op update returns version '1' and writes no version row", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const scope = await orgScope(services, org.id);
      const node = await createNode(services, scope, {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
        properties: { envelope: { netArea: 12.5 } },
      });

      const unchanged = await updateNode(services, scope, node.id, {
        name: "K",
        properties: { envelope: { netArea: 12.5 } },
      });
      expect(unchanged.version).toBe("1");

      const rows = await ctx.db
        .select()
        .from(graphVersion)
        .where(eq(graphVersion.entityId, node.id));
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
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const scope = await orgScope(services, org.id);
      const node = await createNode(services, scope, {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });
      await updateNode(services, scope, node.id, { name: "K renamed" });
      await deleteNode(services, scope, node.id);

      const rows = await ctx.db
        .select()
        .from(graphVersion)
        .where(
          and(
            eq(graphVersion.entityId, node.id),
            eq(graphVersion.op, "deleted")
          )
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        entityType: "node",
        version: "2",
        orgId: org.id,
        contentHash: null,
        snapshot: null,
      });
    });

    it("node delete cascades edge rows WITHOUT writing edge tombstones", async () => {
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

      await deleteNode(services, scope, a.id);

      // Edge row cascaded in Postgres.
      const edges = await ctx.db
        .select()
        .from(graphEdge)
        .where(eq(graphEdge.id, edge.id));
      expect(edges).toHaveLength(0);

      // No edge tombstones; only the node one (DETACH DELETE covers the rest).
      const deleted = await ctx.db
        .select()
        .from(graphVersion)
        .where(eq(graphVersion.op, "deleted"));
      expect(deleted).toHaveLength(1);
      expect(deleted[0]).toMatchObject({ entityType: "node", entityId: a.id });
    });

    it("rolls back the node insert when the version write fails (atomicity)", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const spy = vi
        .spyOn(services.graphVersions, "record")
        .mockRejectedValueOnce(new Error("version write failed"));

      await expect(
        createNode(services, await orgScope(services, org.id), {
          type: "object",
          class: "space.residential.kitchen",
          name: "K",
        })
      ).rejects.toThrow("version write failed");
      spy.mockRestore();

      expect(await ctx.db.select().from(graphNode)).toHaveLength(0);
      expect(await ctx.db.select().from(graphVersion)).toHaveLength(0);
    });
  });
});
