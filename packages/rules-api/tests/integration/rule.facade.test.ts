import { GraphNodeErrors } from "@aec-craft/platform-graph-api";
import {
  buildServices,
  createNode,
  dbAvailable,
  ketoAvailable,
  makeOrg,
  makeProject,
  makeUser,
  projectScope,
  resetSeq,
  type Services,
  useTestDb,
} from "@aec-craft/platform-testing";
import { beforeEach, describe, expect, it } from "vitest";

import { RuleErrors } from "../../src/modules/rule.errors";
import { RuleService } from "../../src/modules/rule.service";

/**
 * The facade contract, against the store it reads through: one type in, and the
 * store's vocabulary never out.
 *
 * The unit test asserts the two constants; this asserts what they do. An object
 * is a row in the same table with the same id space, so "narrowed" and
 * "translated" are only observable with both types present in one project.
 */
describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "the rule facade over graph_node",
  () => {
    const ctx = useTestDb();
    let services: Services;
    let rules: RuleService;

    async function fixture() {
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);
      const scope = await projectScope(services, project.id);
      const object = await createNode(services, scope, {
        type: "object",
        class: "space",
        name: "Ward 3",
      });
      const rule = await createNode(services, scope, {
        type: "rule",
        class: "rule",
        name: "Egress width",
      });
      return { object, owner, rule, scope };
    }

    beforeEach(() => {
      resetSeq();
      services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      rules = new RuleService(services.nodes);
    });

    it("lists rules only, whatever the caller asks for", async () => {
      const f = await fixture();
      const page = await rules.list(f.scope, {}, [f.scope.groupId]);
      expect(page.items.map((row) => row.id)).toEqual([f.rule.id]);
      expect(page.items.every((row) => row.type === "rule")).toBe(true);
    });

    it("reads one by id", async () => {
      const f = await fixture();
      const row = await rules.findById(f.scope, f.rule.id);
      expect(row).toMatchObject({ id: f.rule.id, name: "Egress width" });
    });

    it("answers RULE_NOT_FOUND for an object, never that it is one", async () => {
      const f = await fixture();
      await expect(rules.findById(f.scope, f.object.id)).rejects.toMatchObject({
        code: RuleErrors.NOT_FOUND.code,
      });
    });

    it("answers its own code for a row that does not exist at all", async () => {
      const f = await fixture();
      const absent = "99999999-9999-4999-8999-999999999999";
      const refusal = rules.findById(f.scope, absent);
      await expect(refusal).rejects.toMatchObject({
        code: RuleErrors.NOT_FOUND.code,
      });
      // The store's own code would describe the store rather than the request.
      await expect(refusal).rejects.not.toMatchObject({
        code: GraphNodeErrors.NOT_FOUND.code,
      });
    });

    it("translates the authorization miss too, not only the read", async () => {
      const f = await fixture();
      const absent = "99999999-9999-4999-8999-999999999999";
      await expect(
        rules.authorize(f.owner.principal, absent, "read")
      ).rejects.toMatchObject({ code: RuleErrors.NOT_FOUND.code });
    });

    it("authorizes a row of the other type and refuses it on the read", async () => {
      const f = await fixture();
      // Where the type check sits: authorization resolves the scope off the
      // row, which exists, and the type is the read's to judge. Both paths end
      // in the same 404, so the shape never says which of the two it was.
      const scope = await rules.authorize(
        f.owner.principal,
        f.object.id,
        "read"
      );
      await expect(rules.findById(scope, f.object.id)).rejects.toMatchObject({
        code: RuleErrors.NOT_FOUND.code,
      });
    });
  }
);
