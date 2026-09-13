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

import { ObjectErrors } from "../../src/modules/object.errors";
import { ObjectService } from "../../src/modules/object.service";

/**
 * The facade contract, against the store it reads through: one type in, and the
 * store's vocabulary never out.
 *
 * The unit test asserts the two constants; this asserts what they do. A rule is
 * a row in the same table with the same id space, so "narrowed" and "translated"
 * are only observable with both types present in one project.
 */
describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "the object facade over graph_node",
  () => {
    const ctx = useTestDb();
    let services: Services;
    let objects: ObjectService;

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
      objects = new ObjectService(services.nodes);
    });

    it("lists objects only, whatever the caller asks for", async () => {
      const f = await fixture();
      const page = await objects.list(f.scope, {}, [f.scope.groupId]);
      expect(page.items.map((row) => row.id)).toEqual([f.object.id]);
      expect(page.items.every((row) => row.type === "object")).toBe(true);
    });

    it("reads one by id", async () => {
      const f = await fixture();
      const row = await objects.findById(f.scope, f.object.id);
      expect(row).toMatchObject({ id: f.object.id, name: "Ward 3" });
    });

    it("answers OBJECT_NOT_FOUND for a rule, never that it is one", async () => {
      const f = await fixture();
      await expect(objects.findById(f.scope, f.rule.id)).rejects.toMatchObject({
        code: ObjectErrors.NOT_FOUND.code,
      });
    });

    it("answers its own code for a row that does not exist at all", async () => {
      const f = await fixture();
      const absent = "99999999-9999-4999-8999-999999999999";
      const refusal = objects.findById(f.scope, absent);
      await expect(refusal).rejects.toMatchObject({
        code: ObjectErrors.NOT_FOUND.code,
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
        objects.authorize(f.owner.principal, absent, "read")
      ).rejects.toMatchObject({ code: ObjectErrors.NOT_FOUND.code });
    });

    it("authorizes a row of the other type and refuses it on the read", async () => {
      const f = await fixture();
      // Where the type check sits: authorization resolves the scope off the
      // row, which exists, and the type is the read's to judge. Both paths end
      // in the same 404, so the shape never says which of the two it was.
      const scope = await objects.authorize(
        f.owner.principal,
        f.rule.id,
        "read"
      );
      await expect(objects.findById(scope, f.rule.id)).rejects.toMatchObject({
        code: ObjectErrors.NOT_FOUND.code,
      });
    });
  }
);
