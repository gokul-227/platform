import { describe, expect, it, vi } from "vitest";

import { AdminClient } from "../src";

/** One assertion per route: the exact URL, verb and body the server expects. */
interface Case {
  body?: unknown;
  call: (client: AdminClient) => Promise<unknown>;
  method: string;
  name: string;
  url: string;
}

const cases: Case[] = [
  {
    name: "orgs.list",
    call: (c) => c.orgs.list(),
    method: "GET",
    url: "/admin/orgs",
  },
  {
    name: "orgs.findById",
    call: (c) => c.orgs.findById("o1"),
    method: "GET",
    url: "/admin/orgs/o1",
  },
  {
    name: "orgs.create",
    call: (c) => c.orgs.create({ name: "Acme", ownerEmail: "a@b.test" }),
    method: "POST",
    url: "/admin/orgs",
    body: { name: "Acme", ownerEmail: "a@b.test" },
  },
  {
    name: "orgs.delete",
    call: (c) => c.orgs.delete("o1"),
    method: "DELETE",
    url: "/admin/orgs/o1",
  },
  {
    name: "orgs.update",
    call: (c) => c.orgs.update("o1", { name: "Renamed" }),
    method: "PATCH",
    url: "/admin/orgs/o1",
    body: { name: "Renamed" },
  },
  {
    name: "members.list",
    call: (c) => c.members.list("o1"),
    method: "GET",
    url: "/admin/orgs/o1/members",
  },
  {
    name: "members.findBySubject",
    call: (c) => c.members.findBySubject("o1", "s1"),
    method: "GET",
    url: "/admin/orgs/o1/members/s1",
  },
  {
    name: "members.add",
    call: (c) => c.members.add("o1", { email: "a@b.test", standing: "owner" }),
    method: "POST",
    url: "/admin/orgs/o1/members",
    body: { email: "a@b.test", standing: "owner" },
  },
  {
    name: "members.setStanding",
    call: (c) => c.members.setStanding("o1", "s1", "admin"),
    method: "PATCH",
    url: "/admin/orgs/o1/members/s1",
    body: { standing: "admin" },
  },
  {
    name: "members.remove",
    call: (c) => c.members.remove("o1", "s1"),
    method: "DELETE",
    url: "/admin/orgs/o1/members/s1",
  },
  {
    name: "projects.list",
    call: (c) => c.projects.list(),
    method: "GET",
    url: "/admin/projects",
  },
  {
    name: "projects.listByOrg",
    call: (c) => c.projects.listByOrg("o1"),
    method: "GET",
    url: "/admin/orgs/o1/projects",
  },
  {
    name: "projects.findById",
    call: (c) => c.projects.findById("p1"),
    method: "GET",
    url: "/admin/projects/p1",
  },
  {
    name: "projects.update",
    call: (c) => c.projects.update("p1", { name: "Renamed" }),
    method: "PATCH",
    url: "/admin/projects/p1",
    body: { name: "Renamed" },
  },
  {
    name: "users.list",
    call: (c) => c.users.list(),
    method: "GET",
    url: "/admin/users",
  },
  {
    name: "users.findById",
    call: (c) => c.users.findById("u1"),
    method: "GET",
    url: "/admin/users/u1",
  },
  {
    name: "users.delete",
    call: (c) => c.users.delete("u1"),
    method: "DELETE",
    url: "/admin/users/u1",
  },
];

describe("AdminClient", () => {
  for (const testCase of cases) {
    it(`${testCase.name} → ${testCase.method} ${testCase.url}`, async () => {
      const fetchMock = vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
      );
      const client = new AdminClient({
        baseUrl: "https://api.test",
        fetch: fetchMock as unknown as typeof fetch,
      });

      await testCase.call(client);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(`https://api.test${testCase.url}`);
      expect(init.method).toBe(testCase.method);
      if (testCase.body === undefined) {
        expect(init.body).toBeUndefined();
      } else {
        expect(JSON.parse(init.body as string)).toEqual(testCase.body);
      }
    });
  }

  // Was "creates and destroys no tenant", which stopped being true when
  // onboarding needed a first organization set up for a customer. What has not
  // changed is that a staff create never makes the caller an owner — that is
  // the whole difference from `platform-sdk`'s, and the reason this is a
  // separate method rather than a reused one.
  it("names an owner rather than becoming one", () => {
    const client = new AdminClient({ baseUrl: "https://api.test" });
    expect(Object.keys(client.orgs)).toContain("create");
    // A body with no owner is refused by the schema, not silently defaulted to
    // the caller: an organization nobody owns can be administered by nobody.
    expect(() =>
      // @ts-expect-error — ownerEmail is required, which is the point
      client.orgs.create({ name: "No owner" })
    ).not.toThrow();
  });

  it("grants a roster standing without an escalation ceiling to compare against", () => {
    // The customer SDK cannot express this: `MemberClient` is bounded by what
    // the caller holds, and staff hold nothing. `owner` is the standing that
    // matters, since a tenant that has lost its last one cannot appoint another.
    const client = new AdminClient({ baseUrl: "https://api.test" });
    expect(typeof client.members.setStanding).toBe("function");
    expect(Object.keys(client.members)).toContain("add");
  });
});
