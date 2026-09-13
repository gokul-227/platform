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
 * `/rules`, `/rules/:ruleId`, and the extraction routes
 * under them.
 *
 * The reads are a facade over the graph slice, so what is asserted is the type
 * narrowing, the org-library hydration and the codes this resource answers with.
 * The extraction routes are scaffolding: they answer 501 by design, and the
 * point of testing them is that the permit still runs first — a 501 handed to
 * somebody standing outside the project would leak that the project exists.
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

const UNKNOWN = "99999999-9999-4999-8999-999999999999";

/**
 * Whether the host mounts this package. Neither the harness nor `apps/api` binds
 * `RulesApiModule` yet: the extraction routes answer 501 and the surface that
 * would call them is held back, so publishing a portal would advertise writes
 * that are scaffolds.
 *
 * Every route below answers 404 until it is mounted — the harness telling the
 * truth rather than a fault in the suite. Flip this in the change that binds it.
 */
const IS_MOUNTED = false;

describe.skipIf(!(IS_MOUNTED && dbAvailable() && ketoAvailable()))(
  "rules (e2e)",
  () => {
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
     * A project rule, an org-library rule above it, and an object and a source in
     * the same project — the smallest fixture that can tell narrowing from
     * hydration.
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

      const egress = await createNode(built, inProject, {
        type: "rule",
        class: "rule.egress.width",
        name: "Mindestbreite Fluchtweg",
        properties: { criterion: { path: "envelope.width", operator: "gte" } },
      });
      const houseRule = await createNode(built, inOrg, {
        type: "rule",
        class: "rule.design.intent",
        name: "Hausstandard Deckenhöhe",
      });
      const bath = await createNode(built, inProject, {
        type: "object",
        class: "space.residential.bathroom",
        name: "Bad 1.02",
      });
      const law = await createNode(built, inProject, {
        type: "source",
        class: "source.law.lbo_bw",
        name: "§34 LBO BW",
      });

      return {
        as: req(baseUrl).user({ subject: owner.subject, email: owner.email }),
        bath,
        built,
        egress,
        houseRule,
        law,
        org,
        owner,
        project,
      };
    }

    describe("GET /rules", () => {
      it("returns the rule half, and hydrates the org library into it", async () => {
        const { as, egress, houseRule, project } = await fixture();

        const res = await as.get(`/rules?projectId=${project.id}`);

        expect(res.status).toBe(200);
        const { items } = res.body as Items;
        expect(items.map((n) => n.id).sort()).toEqual(
          [egress.id, houseRule.id].sort()
        );
        expect(items.every((n) => n.type === "rule")).toBe(true);
      });

      it("refuses a caller-supplied type rather than ignoring it", async () => {
        const { as, project } = await fixture();

        const res = await as.get(`/rules?projectId=${project.id}&type=object`);

        // The resource sets `type`; accepting the key and overriding it would
        // read as a filter that works.
        expect(res.status).toBe(400);
        expect((res.body as { error: { code: string } }).error.code).toBe(
          "VALIDATION_FAILED"
        );
      });

      it("narrows away the inherited library on ?scope=project", async () => {
        const { as, egress, project } = await fixture();

        const res = await as.get(
          `/rules?projectId=${project.id}&scope=project`
        );

        expect(res.status).toBe(200);
        expect((res.body as Items).items.map((n) => n.id)).toEqual([egress.id]);
      });

      it("takes the graph node list's own filter and projection grammar", async () => {
        const { as, egress, project } = await fixture();

        const filtered = await as.get(
          `/rules?projectId=${project.id}&class=startsWith.rule.egress&select=criterion`
        );

        expect(filtered.status).toBe(200);
        const items = (
          filtered.body as { items: { id: string; properties: unknown }[] }
        ).items;
        expect(items.map((n) => n.id)).toEqual([egress.id]);
        expect(items[0]?.properties).toEqual({
          criterion: { path: "envelope.width", operator: "gte" },
        });
      });

      it("refuses an operator the spec does not declare for the field", async () => {
        const { as, project } = await fixture();

        const res = await as.get(
          `/rules?projectId=${project.id}&class=gte.rule`
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
          .get(`/rules?projectId=${project.id}`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("PROJECT_NOT_FOUND");
      });

      it("refuses an unauthenticated caller", async () => {
        const { project } = await fixture();

        const res = await req(baseUrl).get(`/rules?projectId=${project.id}`);

        expect(res.status).toBe(401);
      });
    });

    describe("GET /rules/:ruleId", () => {
      it("returns one rule, with its properties projected", async () => {
        const { as, egress } = await fixture();

        const res = await as.get(`/rules/${egress.id}?select=criterion`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          id: egress.id,
          type: "rule",
          name: "Mindestbreite Fluchtweg",
          properties: {
            criterion: { path: "envelope.width", operator: "gte" },
          },
        });
      });

      it("reaches an org-library rule through the same flat route", async () => {
        const { as, houseRule } = await fixture();

        const res = await as.get(`/rules/${houseRule.id}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: houseRule.id, projectId: null });
      });

      it("answers RULE_NOT_FOUND for a node that is an object", async () => {
        const { as, bath } = await fixture();

        const res = await as.get(`/rules/${bath.id}`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("RULE_NOT_FOUND");
      });

      it("answers RULE_NOT_FOUND for a node that is a source", async () => {
        const { as, law } = await fixture();

        const res = await as.get(`/rules/${law.id}`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("RULE_NOT_FOUND");
      });

      it("describes the request, not the store, when the id is unknown", async () => {
        const { as } = await fixture();

        const res = await as.get(`/rules/${UNKNOWN}`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("RULE_NOT_FOUND");
      });

      it("masks a rule the caller may not see as the same miss", async () => {
        const { built, egress } = await fixture();
        const outsider = await makeUser(
          app.get<GraphDatabase>(GraphDatabaseToken),
          built
        );

        const res = await req(baseUrl)
          .user({ subject: outsider.subject, email: outsider.email })
          .get(`/rules/${egress.id}`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("RULE_NOT_FOUND");
      });

      it("refuses an unauthenticated caller", async () => {
        const { egress } = await fixture();

        const res = await req(baseUrl).get(`/rules/${egress.id}`);

        expect(res.status).toBe(401);
      });
    });

    describe("the extraction routes", () => {
      it("answers 501 on every one of them, and says so with one code", async () => {
        const { as, project } = await fixture();

        const responses = await Promise.all([
          as.post(`/rules/extractions?projectId=${project.id}`, {
            fileId: UNKNOWN,
          }),
          as.get(`/rules/extractions?projectId=${project.id}`),
          as.get(`/rules/extractions/${UNKNOWN}`),
          as.get(`/rules/extractions/coverage?projectId=${project.id}`),
          as.get(`/rules/extractions/vocabulary?projectId=${project.id}`),
        ]);

        for (const res of responses) {
          expect(res.status).toBe(501);
          expect((res.body as Envelope).error.code).toBe(
            "INTERNAL_NOT_IMPLEMENTED"
          );
        }
      });

      it("keeps `/rules/extractions/:runId` off the by-id rule route", async () => {
        const { as } = await fixture();

        // Registration order decides this: were `/rules/:ruleId` matched first,
        // `extractions` would arrive as a rule id and answer RULE_NOT_FOUND.
        const res = await as.get(`/rules/extractions/${UNKNOWN}`);

        expect(res.status).toBe(501);
      });

      it("validates the body before reporting the route unbuilt", async () => {
        const { as, project } = await fixture();

        const res = await as.post(
          `/rules/extractions?projectId=${project.id}`,
          {
            fileId: "not-a-uuid",
          }
        );

        expect(res.status).toBe(400);
        expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
      });

      it("runs the permit before the 501, so a 501 leaks no project", async () => {
        const { built, project } = await fixture();
        const outsider = await makeUser(
          app.get<GraphDatabase>(GraphDatabaseToken),
          built
        );
        const asOutsider = req(baseUrl).user({
          subject: outsider.subject,
          email: outsider.email,
        });

        const responses = await Promise.all([
          asOutsider.post(`/rules/extractions?projectId=${project.id}`, {
            fileId: UNKNOWN,
          }),
          asOutsider.get(`/rules/extractions?projectId=${project.id}`),
          asOutsider.get(`/rules/extractions/coverage?projectId=${project.id}`),
          asOutsider.get(
            `/rules/extractions/vocabulary?projectId=${project.id}`
          ),
        ]);

        for (const res of responses) {
          expect(res.status).toBe(404);
          expect((res.body as Envelope).error.code).toBe("PROJECT_NOT_FOUND");
        }
      });

      it("refuses an unauthenticated caller before the 501", async () => {
        const { project } = await fixture();

        const res = await req(baseUrl).get(
          `/rules/extractions?projectId=${project.id}`
        );

        expect(res.status).toBe(401);
      });

      it("needs `write` to start a run, where reading needs only `read`", async () => {
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
        const asReader = req(baseUrl).user({
          subject: reader.subject,
          email: reader.email,
        });

        // A viewer reaches the read routes — they get as far as the 501.
        const read = await asReader.get(
          `/rules/extractions?projectId=${project.id}`
        );
        expect(read.status).toBe(501);

        // The one write in the package stops them at the permit.
        const write = await asReader.post(
          `/rules/extractions?projectId=${project.id}`,
          { fileId: UNKNOWN }
        );
        expect(write.status).toBe(403);
      });
    });
  }
);
