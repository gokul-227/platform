import { graphVersion } from "@aec-craft/platform-graph-api";
import {
  type AuthorizationDatabase,
  AuthorizationDatabaseToken,
  bootstrapTestApp,
  buildServices,
  DatabasePoolToken,
  dbAvailable,
  ensureMigrated,
  type GraphDatabase,
  GraphDatabaseToken,
  ketoAvailable,
  makeOrg,
  makeProject,
  makeUser,
  req,
  resetSeq,
  type TenancyDatabase,
  TenancyDatabaseToken,
  truncateAll,
  type UsersDatabase,
  UsersDatabaseToken,
} from "@aec-craft/platform-testing";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "graph collections + by-id (e2e)",
  () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      ({ app, baseUrl } = await bootstrapTestApp());

      // Before the first `truncateAll`, which reads `group` to clear its

      // tuples and fails on an unmigrated database rather than on an

      // assertion.

      await ensureMigrated(app.get<pg.Pool>(DatabasePoolToken));
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(async () => {
      await truncateAll(app.get<pg.Pool>(DatabasePoolToken));
      resetSeq();
    });

    it("full graph flow: org library + project body + hydration + cross-scope edge + by-id ops", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const services = buildServices(
        db,
        app.get<TenancyDatabase>(TenancyDatabaseToken),
        app.get<UsersDatabase>(UsersDatabaseToken),
        app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
      );
      const owner = await makeUser(db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      // 1. Create an org-scoped source (a law node) via the org changeset.
      const lawRes = await as.post(`/graph?orgId=${org.id}`, {
        edges: [],
        nodes: [
          {
            op: "create",
            type: "source",
            class: "source.law.lbo_bw",
            name: "§34 LBO BW Mindesthöhe",
            properties: { interop: { url: "https://example.test/lbo_bw/34" } },
          },
        ],
      });
      expect(lawRes.status).toBe(200);
      const law = firstNode(lawRes) as {
        id: string;
        orgId: string;
        projectId: string | null;
        type: string;
        phase: string | null;
      };
      expect(law.projectId).toBeNull();
      expect(law.type).toBe("source");
      expect(law.phase).toBeNull();

      // 2. Create a project-scoped bathroom with phase.
      const bathRes = await as.post(`/graph?projectId=${project.id}`, {
        edges: [],
        nodes: [
          {
            op: "create",
            type: "object",
            class: "space.residential.bathroom",
            name: "Bad 1.02",
            phase: "design",
            properties: { envelope: { netArea: 5.8, height: 2.45 } },
          },
        ],
      });
      expect(bathRes.status).toBe(200);
      const bath = firstNode(bathRes) as {
        id: string;
        projectId: string;
        phase: string;
        version: string;
      };
      expect(bath.projectId).toBe(project.id);
      expect(bath.phase).toBe("design");

      // 3. The project collection hydrates: both the law (org) and the bath (project) show up.
      const projectList = await as.get(`/graph/nodes?projectId=${project.id}`);
      expect(projectList.status).toBe(200);
      const projectItems = (projectList.body as { items: { id: string }[] })
        .items;
      expect(projectItems.map((n) => n.id).sort()).toEqual(
        [law.id, bath.id].sort()
      );

      // 4. scope=project narrows to project-only.
      const onlyProject = await as.get(
        `/graph/nodes?projectId=${project.id}&scope=project`
      );
      expect(onlyProject.status).toBe(200);
      expect(
        (onlyProject.body as { items: { id: string }[] }).items.map((n) => n.id)
      ).toEqual([bath.id]);

      // 5. The org collection returns only the library.
      const orgList = await as.get(`/graph/nodes?orgId=${org.id}`);
      expect(orgList.status).toBe(200);
      expect(
        (orgList.body as { items: { id: string }[] }).items.map((n) => n.id)
      ).toEqual([law.id]);

      // 6. Cross-scope edge: an org-library plant serves the project bathroom,
      // written through the project changeset.
      const ruleRes = await as.post(`/graph?orgId=${org.id}`, {
        edges: [],
        nodes: [
          {
            op: "create",
            type: "object",
            class: "element",
            name: "Zentrale Lüftungsanlage",
          },
        ],
      });
      expect(ruleRes.status).toBe(200);
      const plant = firstNode(ruleRes) as { id: string };

      const edgeRes = await as.post(`/graph?projectId=${project.id}`, {
        nodes: [],
        edges: [
          {
            op: "create",
            sourceId: plant.id,
            targetId: bath.id,
            type: "serves",
          },
        ],
      });
      expect(edgeRes.status).toBe(200);
      const edge = firstEdge(edgeRes) as {
        id: string;
        projectId: string;
        type: string;
      };
      expect(edge.projectId).toBe(project.id);
      expect(edge.type).toBe("serves");

      // 7. Update the project node via the changeset (scope-strict: project scope). Version bumps.
      const patchRes = await as.post(`/graph?projectId=${project.id}`, {
        edges: [],
        nodes: [{ op: "update", id: bath.id, phase: "construction" }],
      });
      expect(patchRes.status).toBe(200);
      const patched = firstNode(patchRes) as {
        id: string;
        phase: string;
        version: string;
      };
      expect(patched.phase).toBe("construction");
      expect(Number(patched.version)).toBeGreaterThan(Number(bath.version));

      // 8. Update the org-scoped law through the org changeset — requires
      //    `write` on the organization's group, which the org owner has.
      const lawPatch = await as.post(`/graph?orgId=${org.id}`, {
        edges: [],
        nodes: [{ op: "update", id: law.id, name: "§34 LBO BW (renamed)" }],
      });
      expect(lawPatch.status).toBe(200);
      const lawPatched = firstNode(lawPatch) as {
        name: string;
        projectId: string | null;
      };
      expect(lawPatched.name).toBe("§34 LBO BW (renamed)");
      expect(lawPatched.projectId).toBeNull();

      // 9. GET by id works for either scope through the one flat route.
      const reread = await as.get(`/graph/nodes/${law.id}`);
      expect(reread.status).toBe(200);
      expect(
        (reread.body as { projectId: string | null }).projectId
      ).toBeNull();

      // 10. Non-canonical type goes through (default vocabulary), counter increments.
      const expRes = await as.post(`/graph?projectId=${project.id}`, {
        edges: [],
        nodes: [
          {
            op: "create",
            type: "experimental_kind",
            class: "space.residential.kitchen",
            name: "Experimental",
          },
        ],
      });
      expect(expRes.status).toBe(200);
      const { GraphVocabularyService } = await import(
        "@aec-craft/platform-graph-api/nest"
      );
      const liveVocab = app.get(GraphVocabularyService);
      const hits = Array.from(liveVocab.getCounters().entries()).filter(([k]) =>
        k.startsWith("node_type|experimental_kind|")
      );
      expect(hits.length).toBeGreaterThan(0);

      // 11. Cascade on node delete: the edge from the rule disappears too.
      const delRes = await as.post(`/graph?projectId=${project.id}`, {
        edges: [],
        nodes: [{ op: "delete", id: bath.id }],
      });
      expect(delRes.status).toBe(200);
      const edgeAfter = await as.get(`/graph/edges/${edge.id}`);
      expect(edgeAfter.status).toBe(404);
    });

    it("by-id auth: a non-member sees GRAPH_NODE_NOT_FOUND, never the row", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const services = buildServices(
        db,
        app.get<TenancyDatabase>(TenancyDatabaseToken),
        app.get<UsersDatabase>(UsersDatabaseToken),
        app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
      );

      const owner = await makeUser(db, services);
      const outsider = await makeUser(db, services);
      const org = await makeOrg(services, owner.principal);

      // Owner creates an org-scoped node.
      const asOwner = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });
      const created = await asOwner.post(`/graph?orgId=${org.id}`, {
        edges: [],
        nodes: [
          {
            op: "create",
            type: "source",
            class: "source.law.lbo_bw",
            name: "Secret",
          },
        ],
      });
      expect(created.status).toBe(200);
      const nodeId = (firstNode(created) as { id: string }).id;

      // Outsider asks for it by id. Server reads the row, sees the scope, finds the outsider isn't
      // a member of the org, and surfaces GRAPH_NODE_NOT_FOUND (not FORBIDDEN — we don't reveal existence).
      const asOutsider = req(baseUrl).user({
        subject: outsider.subject,
        email: outsider.email,
      });
      const peek = await asOutsider.get(`/graph/nodes/${nodeId}`);
      expect(peek.status).toBe(404);
      expect((peek.body as { error: { code: string } }).error.code).toBe(
        "GRAPH_NODE_NOT_FOUND"
      );
    });

    it("versioning: a REST-created node leaves exactly one graph_version row", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const services = buildServices(
        db,
        app.get<TenancyDatabase>(TenancyDatabaseToken),
        app.get<UsersDatabase>(UsersDatabaseToken),
        app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
      );
      const owner = await makeUser(db, services);
      const org = await makeOrg(services, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      const res = await as.post(`/graph?orgId=${org.id}`, {
        edges: [],
        nodes: [
          {
            op: "create",
            type: "object",
            class: "space.residential.kitchen",
            name: "Küche 0.01",
            properties: { envelope: { netArea: 12.5 } },
          },
        ],
      });
      expect(res.status).toBe(200);
      const nodeId = (firstNode(res) as { id: string }).id;

      const rows = await db
        .select()
        .from(graphVersion)
        .where(eq(graphVersion.entityId, nodeId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        entityType: "node",
        op: "created",
        version: "1",
        orgId: org.id,
        projectId: null,
      });
      expect(rows[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]!.snapshot!.id).toBe(nodeId);
    });
  }
);

/** First node in a changeset response. */
function firstNode(res: { body: unknown }): unknown {
  return (res.body as { nodes: { items: unknown[] } }).nodes.items[0];
}

/** First edge in a changeset response. */
function firstEdge(res: { body: unknown }): unknown {
  return (res.body as { edges: { items: unknown[] } }).edges.items[0];
}
