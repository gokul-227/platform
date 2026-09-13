import {
  buildServices,
  dbAvailable,
  ketoAvailable,
  makeOrg,
  makeProject,
  makeUser,
  resetSeq,
  type Services,
  useTestDb,
} from "@aec-craft/platform-testing";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * What `estate` means, against a database holding two tenants nobody shares.
 *
 * This package owns no row and no service: every route calls the owning
 * package's own query with its visibility predicate off. That is the whole of
 * the staff surface, and it is only observable with a caller who holds nothing —
 * a tenant read filters by standing, an estate read does not filter at all.
 */
describe.skipIf(!(dbAvailable() && ketoAvailable()))("the estate reads", () => {
  const ctx = useTestDb();
  let services: Services;

  async function twoTenants() {
    const [first, second, staffAdmin] = await Promise.all([
      makeUser(ctx.db, services),
      makeUser(ctx.db, services),
      makeUser(ctx.db, services),
    ]);
    const firstOrg = await makeOrg(services, first.principal);
    const secondOrg = await makeOrg(services, second.principal);
    await makeProject(services, firstOrg.id, first.principal);
    await makeProject(services, secondOrg.id, second.principal);
    return { first, firstOrg, second, secondOrg, staffAdmin };
  }

  beforeEach(() => {
    resetSeq();
    services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
  });

  it("lists every organization, including ones the caller stands nowhere in", async () => {
    const f = await twoTenants();
    const estate = await services.orgs.list({}, { type: "estate" });
    expect(estate.items.map((row) => row.id)).toEqual(
      expect.arrayContaining([f.firstOrg.id, f.secondOrg.id])
    );

    // The same query as a tenant read answers nothing for that caller, which is
    // what the staff surface exists to bypass.
    const asStaffAdmin = await services.orgs.list(
      {},
      { type: "readable", principal: f.staffAdmin.principal }
    );
    expect(asStaffAdmin.items).toEqual([]);
  });

  it("lists every project across tenants, and narrows to one when asked", async () => {
    const f = await twoTenants();
    const all = await services.projects.list({}, { type: "estate" });
    expect(all.total).toBe(2);

    const narrowed = await services.projects.list(
      { orgId: `eq.${f.firstOrg.id}` } as never,
      { type: "estate" }
    );
    expect(narrowed.items.every((row) => row.orgId === f.firstOrg.id)).toBe(
      true
    );
  });

  it("lists every user, which no tenant read does at all", async () => {
    const f = await twoTenants();
    const users = await services.users.list({});
    expect(users.items.map((row) => row.id)).toEqual(
      expect.arrayContaining([f.first.id, f.second.id, f.staffAdmin.id])
    );
  });
});
