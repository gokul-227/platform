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
 * `POST /projects/:projectId/graph/query` and `GET /projects/:projectId/graph/health`.
 *
 * The test host configures no graph database, so nothing here reaches a
 * projection. What that leaves is exactly the part worth covering over HTTP: the
 * two routes are reachable and authorized, the read-only guard refuses before
 * anything is dialled, and the two disagree deliberately about a missing
 * projection — the query fails with 503, the probe reports it and answers 200.
 */

interface Envelope {
  error: { code: string };
}

/** The pool token's type, without restating a dependency on `pg`. */
type Pool = Parameters<typeof truncateAll>[0];

const UNKNOWN = "99999999-9999-4999-8999-999999999999";

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "graph query + health (e2e)",
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

    async function fixture() {
      const built = services();
      const owner = await makeUser(
        app.get<GraphDatabase>(GraphDatabaseToken),
        built
      );
      const org = await makeOrg(built, owner.principal);
      const project = await makeProject(built, org.id, owner.principal);
      return {
        as: req(baseUrl).user({ subject: owner.subject, email: owner.email }),
        built,
        org,
        owner,
        project,
      };
    }

    describe("POST /projects/:projectId/graph/query", () => {
      it("declares the projection missing rather than failing opaquely", async () => {
        const { as, project } = await fixture();

        // Scoped, because the fence runs before the session does: an unscoped
        // statement is refused whether or not a graph database exists.
        const res = await as.post(`/graph/query?projectId=${project.id}`, {
          query: "MATCH (n:Scoped) RETURN n",
        });

        expect(res.status).toBe(503);
        expect((res.body as Envelope).error.code).toBe("GRAPH_UNAVAILABLE");
      });

      it.each([
        ["CREATE (n:Node {name: 'x'}) RETURN n"],
        ["MATCH (n:Node) SET n.name = 'x' RETURN n"],
        ["MATCH (n:Node) DELETE n"],
        ["MATCH (n:Node) DETACH DELETE n"],
        ["MERGE (n:Node {id: 'x'}) RETURN n"],
      ])("refuses the write clause in %s before dialling out", async (query) => {
        const { as, project } = await fixture();

        // The guard runs ahead of the session, which is why this is a 400 and
        // not the 503 a read gets: a write clause is refused on every
        // deployment, configured projection or not.
        const res = await as.post(`/graph/query?projectId=${project.id}`, {
          query,
        });

        expect(res.status).toBe(400);
        expect((res.body as Envelope).error.code).toBe(
          "GRAPH_QUERY_CYPHER_NOT_READ_ONLY"
        );
      });

      it("refuses a body with no statement in it", async () => {
        const { as, project } = await fixture();

        const res = await as.post(`/graph/query?projectId=${project.id}`, {});

        expect(res.status).toBe(400);
        expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
      });

      it("refuses somebody standing outside the project", async () => {
        const { built, project } = await fixture();
        const outsider = await makeUser(
          app.get<GraphDatabase>(GraphDatabaseToken),
          built
        );

        // `authorizeScope` asserts the permit unmasked, so a scoped graph route
        // answers 403 where a `@RequirePermit` route answers the partition's
        // own 404. `graph.authorization.service` covers the same boundary directly.
        const res = await req(baseUrl)
          .user({ subject: outsider.subject, email: outsider.email })
          .post(`/graph/query?projectId=${project.id}`, {
            query: "MATCH (n:Node) RETURN n",
          });

        expect(res.status).toBe(403);
        expect((res.body as Envelope).error.code).toBe("PERMISSION_FORBIDDEN");
      });

      it("checks the permit before the statement, so a refusal leaks no syntax", async () => {
        const { built, project } = await fixture();
        const outsider = await makeUser(
          app.get<GraphDatabase>(GraphDatabaseToken),
          built
        );

        const res = await req(baseUrl)
          .user({ subject: outsider.subject, email: outsider.email })
          .post(`/graph/query?projectId=${project.id}`, {
            query: "MATCH (n:Node) DETACH DELETE n",
          });

        expect(res.status).toBe(403);
      });

      it("refuses an unauthenticated caller", async () => {
        const { project } = await fixture();

        const res = await req(baseUrl).post(
          `/graph/query?projectId=${project.id}`,
          { query: "MATCH (n:Node) RETURN n" }
        );

        expect(res.status).toBe(401);
      });

      it.each([
        // The leak this endpoint was filed for (#186): no entity comes back,
        // so the post-filter has nothing to check and every tenant is counted.
        ["MATCH (n) RETURN count(n) AS c", "GRAPH_QUERY_CYPHER_UNSCOPED"],
        ["MATCH (n:Node) RETURN count(n) AS c", "GRAPH_QUERY_CYPHER_UNSCOPED"],
        [
          "MATCH (n:Project_00000000_0000_4000_8000_000000000000) RETURN n",
          "GRAPH_QUERY_CYPHER_SCOPE_RESERVED",
        ],
        [
          "MATCH (a:Scoped)-[*1..3]-(b:Scoped) RETURN count(*) AS c",
          "GRAPH_QUERY_CYPHER_VARIABLE_LENGTH",
        ],
      ])("refuses `%s` before it reaches the engine", async (query, code) => {
        const { as, project } = await fixture();

        const res = await as.post(`/graph/query?projectId=${project.id}`, {
          query,
        });

        expect(res.status).toBe(400);
        expect((res.body as Envelope).error.code).toBe(code);
      });

      it("answers the project's own miss for an unknown project", async () => {
        const { as } = await fixture();

        const res = await as.post(`/graph/query?projectId=${UNKNOWN}`, {
          query: "MATCH (n:Node) RETURN n",
        });

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("PROJECT_NOT_FOUND");
      });
    });

    describe("GET /projects/:projectId/graph/health", () => {
      it("reports an absent projection rather than erroring over it", async () => {
        const { as, project } = await fixture();

        const res = await as.get(`/graph/health?projectId=${project.id}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          engine: null,
          latencyMs: null,
          reachable: false,
        });
      });

      it("is still a project read: an outsider is refused the probe", async () => {
        const { built, project } = await fixture();
        const outsider = await makeUser(
          app.get<GraphDatabase>(GraphDatabaseToken),
          built
        );

        const res = await req(baseUrl)
          .user({ subject: outsider.subject, email: outsider.email })
          .get(`/graph/health?projectId=${project.id}`);

        expect(res.status).toBe(403);
      });

      it("refuses an unauthenticated caller", async () => {
        const { project } = await fixture();

        const res = await req(baseUrl).get(
          `/graph/health?projectId=${project.id}`
        );

        expect(res.status).toBe(401);
      });
    });
  }
);
