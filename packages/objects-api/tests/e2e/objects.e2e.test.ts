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
 * `/objects` and `/objects/:objectId`.
 *
 * This package owns no table and takes no writes, so the fixture is built
 * through the graph changeset and every assertion here is about what the two
 * reads let through: the type narrowing a caller cannot widen, the hydration a
 * project read inherits from its org, and the codes the facade answers with
 * instead of the store's.
 */

interface Envelope {
  error: { code: string };
}
interface Items {
  items: { id: string; type: string }[];
  nextCursor: string | null;
}

/** The pool token's type, without this package taking a dependency on `pg`. */
type Pool = Parameters<typeof truncateAll>[0];

describe.skipIf(!(dbAvailable() && ketoAvailable()))("objects (e2e)", () => {
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

  /**
   * One project holding an object, a rule and a source, plus an object in the
   * org library above it. Four rows is the smallest fixture that can tell
   * narrowing from hydration.
   */
  async function fixture() {
    const built = services();
    const owner = await makeUser(
      app.get<GraphDatabase>(GraphDatabaseToken),
      built
    );
    const org = await makeOrg(built, owner.principal);
    const project = await makeProject(built, org.id, owner.principal);
    const inProject = await projectScope(built, project.id);
    const inOrg = await orgScope(built, org.id);

    const bath = await createNode(built, inProject, {
      type: "object",
      class: "space.residential.bathroom",
      name: "Bad 1.02",
      properties: { envelope: { netArea: 5.8, height: 2.45 } },
    });
    const plant = await createNode(built, inOrg, {
      type: "object",
      class: "element.ventilation",
      name: "Zentrale Lüftungsanlage",
    });
    const rule = await createNode(built, inProject, {
      type: "rule",
      class: "rule.egress",
      name: "Mindestbreite Fluchtweg",
    });
    const source = await createNode(built, inProject, {
      type: "source",
      class: "source.law.lbo_bw",
      name: "§34 LBO BW",
    });

    return {
      as: req(baseUrl).user({ subject: owner.subject, email: owner.email }),
      bath,
      built,
      org,
      owner,
      plant,
      project,
      rule,
      source,
    };
  }

  describe("GET /objects", () => {
    it("returns the object half, and hydrates the org library into it", async () => {
      const { as, bath, plant, project } = await fixture();

      const res = await as.get(`/objects?projectId=${project.id}`);

      expect(res.status).toBe(200);
      const { items } = res.body as Items;
      expect(items.map((n) => n.id).sort()).toEqual([bath.id, plant.id].sort());
      expect(items.every((n) => n.type === "object")).toBe(true);
    });

    it("refuses a caller-supplied type rather than ignoring it", async () => {
      const { as, project } = await fixture();

      const res = await as.get(`/objects?projectId=${project.id}&type=rule`);

      // The resource sets `type`; accepting the key and overriding it would
      // read as a filter that works.
      expect(res.status).toBe(400);
      expect((res.body as { error: { code: string } }).error.code).toBe(
        "VALIDATION_FAILED"
      );
    });

    it("narrows away the inherited library on ?scope=project", async () => {
      const { as, bath, project } = await fixture();

      const res = await as.get(
        `/objects?projectId=${project.id}&scope=project`
      );

      expect(res.status).toBe(200);
      expect((res.body as Items).items.map((n) => n.id)).toEqual([bath.id]);
    });

    it("takes the graph node list's own filter grammar", async () => {
      const { as, bath, project } = await fixture();

      const byClass = await as.get(
        `/objects?projectId=${project.id}&class=startsWith.space.`
      );
      expect(byClass.status).toBe(200);
      expect((byClass.body as Items).items.map((n) => n.id)).toEqual([bath.id]);

      const byProperty = await as.get(
        `/objects?projectId=${project.id}&properties=hasKey.envelope`
      );
      expect(byProperty.status).toBe(200);
      expect((byProperty.body as Items).items.map((n) => n.id)).toEqual([
        bath.id,
      ]);
    });

    it("projects the properties bag on ?select=", async () => {
      const { as, bath, project } = await fixture();

      const res = await as.get(
        `/objects?projectId=${project.id}&id=eq.${bath.id}&select=envelope`
      );

      expect(res.status).toBe(200);
      const [only] = (res.body as { items: { properties: unknown }[] }).items;
      expect(only?.properties).toEqual({
        envelope: { netArea: 5.8, height: 2.45 },
      });
    });

    it("pages, and hands back a usable cursor", async () => {
      const { as, project } = await fixture();

      const first = await as.get(`/objects?projectId=${project.id}&limit=1`);
      expect(first.status).toBe(200);
      const page = first.body as Items;
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeTruthy();

      const second = await as.get(
        `/objects?projectId=${project.id}&limit=1&cursor=${encodeURIComponent(
          page.nextCursor ?? ""
        )}`
      );
      expect(second.status).toBe(200);
      const rest = second.body as Items;
      expect(rest.items).toHaveLength(1);
      expect(rest.items[0]?.id).not.toBe(page.items[0]?.id);
    });

    it("refuses an operator the spec does not declare for the field", async () => {
      const { as, project } = await fixture();

      const res = await as.get(
        `/objects?projectId=${project.id}&class=gte.space`
      );

      expect(res.status).toBe(400);
      expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
    });

    it("refuses a value the field's type cannot hold", async () => {
      const { as, project } = await fixture();

      const res = await as.get(
        `/objects?projectId=${project.id}&parentId=eq.not-a-uuid`
      );

      expect(res.status).toBe(400);
      expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
    });

    it("hides the project from someone standing outside it", async () => {
      const { built, project } = await fixture();
      const outsider = await makeUser(
        app.get<GraphDatabase>(GraphDatabaseToken),
        built
      );

      const res = await req(baseUrl)
        .user({ subject: outsider.subject, email: outsider.email })
        .get(`/objects?projectId=${project.id}`);

      expect(res.status).toBe(404);
      expect((res.body as Envelope).error.code).toBe("PROJECT_NOT_FOUND");
    });

    it("refuses an unauthenticated caller", async () => {
      const { project } = await fixture();

      const res = await req(baseUrl).get(`/objects?projectId=${project.id}`);

      expect(res.status).toBe(401);
    });
  });

  describe("GET /objects/:objectId", () => {
    it("returns one object, with its properties projected", async () => {
      const { as, bath } = await fixture();

      const res = await as.get(`/objects/${bath.id}?select=envelope`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: bath.id,
        type: "object",
        name: "Bad 1.02",
        properties: { envelope: { netArea: 5.8, height: 2.45 } },
      });
    });

    it("reaches an object in the org library through the same flat route", async () => {
      const { as, plant } = await fixture();

      const res = await as.get(`/objects/${plant.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: plant.id, projectId: null });
    });

    it("answers OBJECT_NOT_FOUND for a node that is a rule", async () => {
      const { as, rule } = await fixture();

      const res = await as.get(`/objects/${rule.id}`);

      expect(res.status).toBe(404);
      expect((res.body as Envelope).error.code).toBe("OBJECT_NOT_FOUND");
    });

    it("answers OBJECT_NOT_FOUND for a node that is a source", async () => {
      const { as, source } = await fixture();

      const res = await as.get(`/objects/${source.id}`);

      expect(res.status).toBe(404);
      expect((res.body as Envelope).error.code).toBe("OBJECT_NOT_FOUND");
    });

    it("describes the request, not the store, when the id is unknown", async () => {
      const { as } = await fixture();

      const res = await as.get("/objects/99999999-9999-4999-8999-999999999999");

      expect(res.status).toBe(404);
      expect((res.body as Envelope).error.code).toBe("OBJECT_NOT_FOUND");
    });

    it("masks an object the caller may not see as the same miss", async () => {
      const { bath, built } = await fixture();
      const outsider = await makeUser(
        app.get<GraphDatabase>(GraphDatabaseToken),
        built
      );

      const res = await req(baseUrl)
        .user({ subject: outsider.subject, email: outsider.email })
        .get(`/objects/${bath.id}`);

      expect(res.status).toBe(404);
      expect((res.body as Envelope).error.code).toBe("OBJECT_NOT_FOUND");
    });

    it("refuses an unauthenticated caller", async () => {
      const { bath } = await fixture();

      const res = await req(baseUrl).get(`/objects/${bath.id}`);

      expect(res.status).toBe(401);
    });
  });
});
