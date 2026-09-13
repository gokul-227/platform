import {
  type AuthorizationDatabase,
  AuthorizationDatabaseToken,
  bootstrapTestApp,
  buildServices,
  createEdge,
  createNode,
  DatabasePoolToken,
  dbAvailable,
  ensureMigrated,
  type GraphDatabase,
  GraphDatabaseToken,
  ketoAvailable,
  makeOrg,
  makeProject,
  makeUser,
  orgScope,
  projectScope,
  req,
  resetSeq,
  type Services,
  type TenancyDatabase,
  TenancyDatabaseToken,
  truncateAll,
  type UsersDatabase,
  UsersDatabaseToken,
} from "@aec-craft/platform-testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * `GET /orgs/:orgId/graph/edges` and `GET /projects/:projectId/graph/edges`.
 *
 * The node collections are covered next door; these are the same two shapes over
 * the edge table, and what is asserted is what differs: which partition each one
 * answers from, that a project read hydrates the org library into itself, and
 * that the edge spec's own filters reach the query.
 */

interface Envelope {
  error: { code: string };
}
interface Items {
  items: { id: string; type: string }[];
  nextCursor: string | null;
}

/** The pool token's type, without restating a dependency on `pg`. */
type Pool = Parameters<typeof truncateAll>[0];

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "graph edge collections (e2e)",
  () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      ({ app, baseUrl } = await bootstrapTestApp());
      await ensureMigrated(app.get<Pool>(DatabasePoolToken));
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(async () => {
      await truncateAll(app.get<Pool>(DatabasePoolToken));
      resetSeq();
    });

    function services(): Services {
      return buildServices(
        app.get<GraphDatabase>(GraphDatabaseToken),
        app.get<TenancyDatabase>(TenancyDatabaseToken),
        app.get<UsersDatabase>(UsersDatabaseToken),
        app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
      );
    }

    /** One edge in the org library, two in the project. */
    async function fixture() {
      const built = services();
      const owner = await makeUser(
        app.get<GraphDatabase>(GraphDatabaseToken),
        built
      );
      const org = await makeOrg(built, owner.principal);
      const project = await makeProject(built, org.id, owner.principal);
      const inOrg = await orgScope(built, org.id);
      const inProject = await projectScope(built, project.id);

      const plant = await createNode(built, inOrg, {
        type: "object",
        class: "element.ventilation",
        name: "Zentrale Lüftungsanlage",
      });
      const duct = await createNode(built, inOrg, {
        type: "object",
        class: "element.duct",
        name: "Steigschacht",
      });
      const storey = await createNode(built, inProject, {
        type: "object",
        class: "storey",
        name: "EG",
      });
      const bath = await createNode(built, inProject, {
        type: "object",
        class: "space.residential.bathroom",
        name: "Bad 1.02",
      });

      const libraryEdge = await createEdge(built, inOrg, {
        sourceId: duct.id,
        targetId: plant.id,
        type: "hostedIn",
      });
      const projectEdge = await createEdge(built, inProject, {
        sourceId: bath.id,
        targetId: storey.id,
        type: "hostedIn",
        properties: { interop: { source: "ifc" } },
      });
      const servesEdge = await createEdge(built, inProject, {
        sourceId: plant.id,
        targetId: bath.id,
        type: "serves",
      });

      return {
        as: req(baseUrl).user({ subject: owner.subject, email: owner.email }),
        bath,
        built,
        libraryEdge,
        org,
        owner,
        project,
        projectEdge,
        servesEdge,
      };
    }

    describe("GET /orgs/:orgId/graph/edges", () => {
      it("returns the org library and nothing from the projects under it", async () => {
        const { as, libraryEdge, org } = await fixture();

        const res = await as.get(`/graph/edges?orgId=${org.id}`);

        expect(res.status).toBe(200);
        expect((res.body as Items).items.map((e) => e.id)).toEqual([
          libraryEdge.id,
        ]);
      });

      it("refuses an unauthenticated caller", async () => {
        const { org } = await fixture();

        const res = await req(baseUrl).get(`/graph/edges?orgId=${org.id}`);

        expect(res.status).toBe(401);
      });
    });

    describe("GET /projects/:projectId/graph/edges", () => {
      it("hydrates the org library into the project's own edges", async () => {
        const { as, libraryEdge, project, projectEdge, servesEdge } =
          await fixture();

        const res = await as.get(`/graph/edges?projectId=${project.id}`);

        expect(res.status).toBe(200);
        expect((res.body as Items).items.map((e) => e.id).sort()).toEqual(
          [libraryEdge.id, projectEdge.id, servesEdge.id].sort()
        );
      });

      it("narrows away the inherited library on ?scope=project", async () => {
        const { as, project, projectEdge, servesEdge } = await fixture();

        const res = await as.get(
          `/graph/edges?projectId=${project.id}&scope=project`
        );

        expect(res.status).toBe(200);
        expect((res.body as Items).items.map((e) => e.id).sort()).toEqual(
          [projectEdge.id, servesEdge.id].sort()
        );
      });

      it("filters on the edge spec's own fields", async () => {
        const { as, bath, project, servesEdge } = await fixture();

        const byType = await as.get(
          `/graph/edges?projectId=${project.id}&type=serves`
        );
        expect(byType.status).toBe(200);
        expect((byType.body as Items).items.map((e) => e.id)).toEqual([
          servesEdge.id,
        ]);

        const byTarget = await as.get(
          `/graph/edges?projectId=${project.id}&targetId=eq.${bath.id}`
        );
        expect(byTarget.status).toBe(200);
        expect((byTarget.body as Items).items.map((e) => e.id)).toEqual([
          servesEdge.id,
        ]);
      });

      it("projects the properties bag on ?select=", async () => {
        const { as, project, projectEdge } = await fixture();

        const res = await as.get(
          `/graph/edges?projectId=${project.id}&scope=project&type=hostedIn&select=interop`
        );

        expect(res.status).toBe(200);
        const items = (
          res.body as { items: { id: string; properties: unknown }[] }
        ).items;
        expect(items.map((e) => e.id)).toEqual([projectEdge.id]);
        expect(items[0]?.properties).toEqual({ interop: { source: "ifc" } });
      });

      it("answers null for a projected key the bag does not carry", async () => {
        const { as, project } = await fixture();

        const res = await as.get(
          `/graph/edges?projectId=${project.id}&scope=project&type=serves&select=interop`
        );

        expect(res.status).toBe(200);
        const items = (
          res.body as {
            items: { properties: unknown; propertyKeys: string[] }[];
          }
        ).items;
        expect(items[0]?.properties).toEqual({ interop: null });
        // `propertyKeys` always reflects the whole stored bag, projection or not.
        expect(items[0]?.propertyKeys).toEqual([]);
      });

      it("refuses an operator the spec does not declare for the field", async () => {
        const { as, project } = await fixture();

        const res = await as.get(
          `/graph/edges?projectId=${project.id}&targetId=contains.abc`
        );

        expect(res.status).toBe(400);
        expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
      });

      it("refuses an unauthenticated caller", async () => {
        const { project } = await fixture();

        const res = await req(baseUrl).get(
          `/graph/edges?projectId=${project.id}`
        );

        expect(res.status).toBe(401);
      });
    });
  }
);
