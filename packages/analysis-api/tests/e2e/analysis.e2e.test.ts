import {
  type AuthorizationDatabase,
  AuthorizationDatabaseToken,
  bootstrapTestApp,
  buildServices,
  createNode,
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
 * The eight analysis routes, over HTTP.
 *
 * The suites beside this one prove the analyses compute the right answers,
 * against a real projection. What is asserted here is the half those cannot see:
 * that each route is reachable at all, that the permit runs before the body is
 * parsed, that the body is validated, and that the six traversal analyses
 * degrade to the 503 they declare rather than to a stack trace when no graph
 * database is configured.
 *
 * Quantity and ratio answer from Postgres, so they compute for real here.
 */

interface Envelope {
  error: { code: string };
}

/** The pool token's type, without restating a dependency on `pg`. */
type Pool = Parameters<typeof truncateAll>[0];

const UNKNOWN = "99999999-9999-4999-8999-999999999999";

/** The six that walk the projection, with a valid body for each. */
const TRAVERSALS = [
  { body: {}, name: "adjacency" },
  { body: {}, name: "chokepoints" },
  { body: {}, name: "connectivity" },
  { body: {}, name: "containment" },
  { body: {}, name: "egress" },
  { body: { fromId: UNKNOWN, toId: UNKNOWN }, name: "routing" },
] as const;

/** Every route, for the checks that do not care which analysis answered. */
const ALL = [
  ...TRAVERSALS,
  {
    body: { aggregate: { method: "count" }, select: {} },
    name: "quantity",
  },
  {
    body: {
      denominator: { aggregate: { method: "count" }, select: {} },
      numerator: { aggregate: { method: "count" }, select: {} },
    },
    name: "ratio",
  },
] as const;

describe.skipIf(!(dbAvailable() && ketoAvailable()))("analysis (e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    ({ app, baseUrl } = await bootstrapTestApp());
    // Before the first `truncateAll`, which reads `group` to clear its tuples.
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

  /** A storey with three spaces on it, two of them offices. */
  async function fixture() {
    const built = services();
    const owner = await makeUser(
      app.get<GraphDatabase>(GraphDatabaseToken),
      built
    );
    const org = await makeOrg(built, owner.principal);
    const project = await makeProject(built, org.id, owner.principal);
    const scope = await projectScope(built, project.id);

    const storey = await createNode(built, scope, {
      type: "object",
      class: "storey",
      name: "EG",
    });
    const office1 = await createNode(built, scope, {
      type: "object",
      class: "space.office",
      name: "Büro 0.01",
      parentId: storey.id,
      properties: {
        envelope: { areaNet: 20 },
        programme: { use: "office" },
      },
    });
    const office2 = await createNode(built, scope, {
      type: "object",
      class: "space.office",
      name: "Büro 0.02",
      parentId: storey.id,
      properties: {
        envelope: { areaNet: 30 },
        programme: { use: "office" },
      },
    });
    const corridor = await createNode(built, scope, {
      type: "object",
      class: "space.circulation",
      name: "Flur 0.03",
      parentId: storey.id,
      properties: {
        envelope: { areaNet: 10 },
        programme: { use: "circulation" },
      },
    });

    return {
      as: req(baseUrl).user({ subject: owner.subject, email: owner.email }),
      built,
      corridor,
      office1,
      office2,
      org,
      owner,
      project,
      storey,
    };
  }

  const url = (projectId: string, name: string) =>
    `/projects/${projectId}/analysis/${name}`;

  describe("quantity", () => {
    it("counts the nodes a selection matches", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "quantity"), {
        aggregate: { method: "count" },
        select: { class: { match: "prefix", value: "space" } },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ grouped: false, value: 3 });
    });

    it("totals a property path over a class", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "quantity"), {
        aggregate: { field: "envelope.areaNet", method: "sum" },
        select: { class: { match: "prefix", value: "space" } },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ grouped: false, value: 60 });
    });

    it("honours `exact` against the class root's subtypes", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "quantity"), {
        aggregate: { method: "count" },
        select: { class: { match: "exact", value: "space" } },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ grouped: false, value: 0 });
    });

    it("filters on a predicate before aggregating", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "quantity"), {
        aggregate: { method: "count" },
        select: {
          class: { match: "prefix", value: "space" },
          where: [{ operator: "gte", path: "envelope.areaNet", value: 20 }],
        },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ grouped: false, value: 2 });
    });

    it("groups by a field, returning rows instead of one value", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "quantity"), {
        aggregate: { field: "envelope.areaNet", method: "sum" },
        groupBy: { by: "field", field: "programme.use" },
        select: { class: { match: "prefix", value: "space" } },
      });

      expect(res.status).toBe(200);
      const body = res.body as {
        grouped: true;
        groups: { group: string; value: number }[];
      };
      expect(body.grouped).toBe(true);
      expect(
        Object.fromEntries(body.groups.map((row) => [row.group, row.value]))
      ).toEqual({ circulation: 10, office: 50 });
    });

    it("answers null, not zero, for an average over nothing", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "quantity"), {
        aggregate: { field: "envelope.areaNet", method: "avg" },
        select: { class: { match: "prefix", value: "nothing" } },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ grouped: false, value: null });
    });

    it("refuses an aggregate that names no field but is not a count", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "quantity"), {
        aggregate: { method: "sum" },
        select: {},
      });

      expect(res.status).toBe(400);
      expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
    });

    it("refuses a property path that is not a dot-path of identifiers", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "quantity"), {
        aggregate: { field: "envelope.areaNet; drop table", method: "sum" },
        select: {},
      });

      expect(res.status).toBe(400);
      expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("ratio", () => {
    it("divides one quantity by another", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "ratio"), {
        denominator: {
          aggregate: { field: "envelope.areaNet", method: "sum" },
          select: { class: { match: "prefix", value: "space" } },
        },
        numerator: {
          aggregate: { field: "envelope.areaNet", method: "sum" },
          select: { class: { match: "prefix", value: "space.circulation" } },
        },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        denominator: 60,
        numerator: 10,
      });
      expect((res.body as { value: number }).value).toBeCloseTo(10 / 60);
    });

    it("multiplies by a hundred when asked for a percentage", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "ratio"), {
        denominator: {
          aggregate: { field: "envelope.areaNet", method: "sum" },
          select: { class: { match: "prefix", value: "space" } },
        },
        isPercent: true,
        numerator: {
          aggregate: { field: "envelope.areaNet", method: "sum" },
          select: { class: { match: "prefix", value: "space.circulation" } },
        },
      });

      expect(res.status).toBe(200);
      expect((res.body as { value: number }).value).toBeCloseTo(
        (10 / 60) * 100
      );
    });

    it("hands back both operands so a null answer can be explained", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "ratio"), {
        denominator: {
          aggregate: { field: "envelope.areaNet", method: "sum" },
          select: { class: { match: "prefix", value: "nothing" } },
        },
        numerator: {
          aggregate: { field: "envelope.areaNet", method: "sum" },
          select: { class: { match: "prefix", value: "space" } },
        },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        denominator: null,
        numerator: 60,
        value: null,
      });
    });

    it("refuses a body carrying only one spec", async () => {
      const { as, project } = await fixture();

      const res = await as.post(url(project.id, "ratio"), {
        numerator: { aggregate: { method: "count" }, select: {} },
      });

      expect(res.status).toBe(400);
      expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("the analyses that walk the projection", () => {
    it.each(
      TRAVERSALS
    )("$name declares its dependency rather than failing opaquely", async ({
      body,
      name,
    }) => {
      const { as, project } = await fixture();

      // The test host binds no graph database, so the driver is null. The
      // route is reachable, authorized and validated; the projection is what
      // is missing, and the analysis says so.
      const res = await as.post(url(project.id, name), body);

      expect(res.status).toBe(503);
      expect((res.body as Envelope).error.code).toBe("GRAPH_UNAVAILABLE");
    });

    it("validates the body before reaching for the projection", async () => {
      const { as, project } = await fixture();

      const responses = await Promise.all([
        as.post(url(project.id, "routing"), { fromId: UNKNOWN }),
        as.post(url(project.id, "egress"), { maxDistance: -1 }),
        as.post(url(project.id, "adjacency"), { parentId: "not-a-uuid" }),
        as.post(url(project.id, "containment"), { classes: [] as string[] }),
      ]);

      for (const res of responses.slice(0, 3)) {
        expect(res.status).toBe(400);
        expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
      }
      // An empty class list is a legal narrowing, not a malformed body.
      expect(responses[3]?.status).toBe(503);
    });
  });

  describe("the boundary every analysis sits behind", () => {
    it.each(ALL)("$name refuses an unauthenticated caller", async ({
      body,
      name,
    }) => {
      const { project } = await fixture();

      const res = await req(baseUrl).post(url(project.id, name), body);

      expect(res.status).toBe(401);
    });

    it.each(
      ALL
    )("$name hides the project from somebody standing outside it", async ({
      body,
      name,
    }) => {
      const { built, project } = await fixture();
      const outsider = await makeUser(
        app.get<GraphDatabase>(GraphDatabaseToken),
        built
      );

      const res = await req(baseUrl)
        .user({ subject: outsider.subject, email: outsider.email })
        .post(url(project.id, name), body);

      expect(res.status).toBe(404);
      expect((res.body as Envelope).error.code).toBe("PROJECT_NOT_FOUND");
    });

    it("lets a viewer run one: analysis is a read", async () => {
      const { built, owner, project } = await fixture();
      const reader = await makeUser(
        app.get<GraphDatabase>(GraphDatabaseToken),
        built
      );
      await grantStanding(
        built,
        owner.principal,
        await groupOf(built, { projectId: project.id }),
        reader.subject,
        "viewer"
      );

      const res = await req(baseUrl)
        .user({ subject: reader.subject, email: reader.email })
        .post(url(project.id, "quantity"), {
          aggregate: { method: "count" },
          select: { class: { match: "prefix", value: "space" } },
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ grouped: false, value: 3 });
    });

    it("counts this project's rows, never the org's other projects", async () => {
      const { as, built, org, owner, project } = await fixture();
      // A second project in the same org, with a space of its own. Both
      // predicates go in the query: an aggregate filtered by group alone would
      // count this row too, and a wrong count still looks like a count.
      const other = await makeProject(built, org.id, owner.principal, {
        name: "Nachbarprojekt",
      });
      await createNode(built, await projectScope(built, other.id), {
        type: "object",
        class: "space.office",
        name: "Fremdes Büro",
        properties: { envelope: { areaNet: 999 } },
      });

      const res = await as.post(url(project.id, "quantity"), {
        aggregate: { field: "envelope.areaNet", method: "sum" },
        select: { class: { match: "prefix", value: "space" } },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ grouped: false, value: 60 });
    });

    it("answers the project's own miss for an unknown project", async () => {
      const { as } = await fixture();

      const res = await as.post(url(UNKNOWN, "quantity"), {
        aggregate: { method: "count" },
        select: {},
      });

      expect(res.status).toBe(404);
      expect((res.body as Envelope).error.code).toBe("PROJECT_NOT_FOUND");
    });
  });
});
