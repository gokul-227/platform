import {
  buildServices,
  dbAvailable,
  makeUser,
  resetSeq,
  useTestDb,
} from "@aec-craft/platform-testing";
import { describe, expect, it } from "vitest";
import { UserErrors } from "../../src/modules/user.errors";

describe.skipIf(!dbAvailable())("UserService (integration)", () => {
  const ctx = useTestDb();

  it("upsert creates the profile, and a second call updates it", async () => {
    resetSeq();
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const subject = "11111111-2222-4333-8444-555555555555";
    const u = await services.users.upsertByExternalId({
      externalId: subject,
      email: "alice@example.test",
      name: "Alice",
    });
    expect(u.email).toBe("alice@example.test");
    expect(u.id).toMatch(/^[0-9a-f-]{36}$/);

    // The identity provider fires the same hook after a settings change, so a
    // repeat has to land on the existing row rather than failing or duplicating.
    const again = await services.users.upsertByExternalId({
      externalId: subject,
      email: "alice@example.test",
      name: "Alice Renamed",
    });
    expect(again.id).toBe(u.id);
    expect(again.name).toBe("Alice Renamed");

    await expect(services.users.findById(u.id)).resolves.toMatchObject({
      id: u.id,
      name: "Alice Renamed",
    });
  });

  it("findById throws USER_NOT_FOUND for an unknown id", async () => {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    await expect(
      services.users.findById("00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ code: UserErrors.NOT_FOUND.code });
  });

  it("list returns rows ordered by createdAt asc", async () => {
    resetSeq();
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const a = await makeUser(ctx.db, services, { name: "First" });
    // Force a perceptible createdAt gap so ordering is deterministic regardless
    // of the test clock's resolution.
    await new Promise((r) => setTimeout(r, 5));
    const b = await makeUser(ctx.db, services, { name: "Second" });

    const list = (await services.users.list({})).items;
    const ids = list.map((u) => u.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });

  it("applies framework filter: email=contains.<text> narrows", async () => {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const matching = await makeUser(ctx.db, services, {
      email: "marius@filter.test",
    });
    await makeUser(ctx.db, services, { email: "other@example.test" });

    const list = (
      await services.users.list({
        email: "contains.@filter.test",
      })
    ).items;
    expect(list.map((u) => u.email)).toContain(matching.email);
    expect(list.every((u) => u.email.includes("@filter.test"))).toBe(true);
  });

  it("applies framework sort: ?sort=email:desc", async () => {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    await makeUser(ctx.db, services, { email: "a-sort@example.test" });
    await makeUser(ctx.db, services, { email: "z-sort@example.test" });

    const list = (await services.users.list({ sort: ["email:desc"] })).items;
    const emails = list
      .map((u) => u.email)
      .filter((e) => e.endsWith("-sort@example.test"));
    expect(emails).toEqual(["z-sort@example.test", "a-sort@example.test"]);
  });

  describe("update (self)", () => {
    it("updates the picture", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const u = await makeUser(ctx.db, services);
      const updated = await services.me.update(u.principal, {
        picture: "https://example.test/pic.png",
      });
      expect(updated).toMatchObject({
        picture: "https://example.test/pic.png",
      });
    });

    // One writer per column. `name` reaching this far means a caller sent it
    // past the DTO, and the service must still refuse to be its second writer.
    it("ignores a name, which belongs to the identity", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const u = await makeUser(ctx.db, services);
      const before = await services.me.get(u.principal);

      const updated = await services.me.update(u.principal, {
        name: "Renamed",
      } as never);

      expect(updated.name).toBe(before.name);
    });
  });

  describe("upsert (the identity provider's hook)", () => {
    // The hook fires again on every settings change. It used to spell `picture`
    // out in the update clause, so a password change erased the avatar.
    it("leaves the avatar alone when it fires a second time", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const u = await makeUser(ctx.db, services);
      await services.me.update(u.principal, {
        picture: "https://example.test/keep.png",
      });

      const after = await services.users.upsertByExternalId({
        externalId: u.principal.subject,
        email: u.email,
        name: "Renamed By The Provider",
      });

      expect(after.picture).toBe("https://example.test/keep.png");
      // What the provider does own still lands.
      expect(after.name).toBe("Renamed By The Provider");
    });

    // What an identity-provider swap looks like from here: the same person
    // arrives with a new identity id. The row is rebound, because `email` is
    // unique and the insert this used to attempt died on that constraint,
    // taking the hook with it.
    it("rebinds the profile when the same email arrives under a new identity", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const before = await makeUser(ctx.db, services);
      await services.me.update(before.principal, {
        picture: "https://example.test/same-person.png",
      });

      const swapped = await services.users.upsertByExternalId({
        externalId: "kratos-identity-after-the-swap",
        email: before.email,
        name: "Same Person",
      });

      // The same row, so everything hanging off `user.id` survives.
      expect(swapped.id).toBe(before.id);
      expect(swapped.picture).toBe("https://example.test/same-person.png");

      // And it now answers to the new identity rather than the old one.
      const asNew = await services.users.upsertByExternalId({
        externalId: "kratos-identity-after-the-swap",
        email: before.email,
        name: "Same Person",
      });
      expect(asNew.id).toBe(before.id);
    });
  });
});
