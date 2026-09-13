import { describe, expect, it, vi } from "vitest";

import { PlatformClient } from "../src";

/**
 * One assertion per route: each method produces the exact URL, method, and
 * body the server expects. Catches typos that would only surface at runtime
 * (missing slash, wrong verb, body field rename, etc.).
 *
 * TODO(drift): this list is maintained by hand. A server route added without
 * a matching SDK method goes unnoticed here. When `@nestjs/swagger` + Scalar
 * land in platform-api, drive coverage off the generated OpenAPI spec instead
 * (assert every operationId has a corresponding SDK method, or code-generate
 * the SDK from the spec).
 */

interface Case {
  body?: unknown;
  call: (client: PlatformClient) => Promise<unknown>;
  method: string;
  name: string;
  url: string;
}

const cases: Case[] = [
  // me
  { name: "me.get", call: (c) => c.me.get(), method: "GET", url: "/me" },
  {
    name: "me.update",
    call: (c) => c.me.update({ picture: "https://x.test/a.png" }),
    method: "PATCH",
    url: "/me",
    body: { picture: "https://x.test/a.png" },
  },

  {
    name: "me.standings",
    call: (c) => c.me.standings("o1"),
    method: "GET",
    url: "/me/groups?orgId=o1",
  },

  // members — who is in a partition. One client for both scopes; the path is
  // the only difference between them.
  {
    name: "members.list (org)",
    call: (c) => c.members.list({ type: "org", orgId: "o1" }),
    method: "GET",
    url: "/orgs/o1/members",
  },
  {
    name: "members.list (project, paged)",
    call: (c) =>
      c.members.list({ type: "project", projectId: "p1" }, { pageSize: 200 }),
    method: "GET",
    url: "/projects/p1/members?pageSize=200",
  },
  {
    name: "members.add",
    call: (c) =>
      c.members.add(
        { type: "org", orgId: "o1" },
        { subject: "u1", standing: "editor" }
      ),
    method: "POST",
    url: "/orgs/o1/members",
    body: { subject: "u1", standing: "editor" },
  },
  {
    name: "members.setStanding",
    call: (c) =>
      c.members.setStanding(
        { type: "project", projectId: "p1" },
        "u1",
        "viewer"
      ),
    method: "PATCH",
    url: "/projects/p1/members/u1",
    body: { standing: "viewer" },
  },
  {
    name: "members.remove",
    call: (c) => c.members.remove({ type: "org", orgId: "o1" }, "u1"),
    method: "DELETE",
    url: "/orgs/o1/members/u1",
  },

  // orgs
  {
    name: "orgs.list",
    call: (c) => c.orgs.list(),
    method: "GET",
    url: "/orgs",
  },
  {
    name: "orgs.findById",
    call: (c) => c.orgs.findById("o1"),
    method: "GET",
    url: "/orgs/o1",
  },
  {
    name: "orgs.create",
    call: (c) => c.orgs.create({ name: "Acme" }),
    method: "POST",
    url: "/orgs",
    body: { name: "Acme" },
  },
  {
    name: "orgs.update",
    call: (c) => c.orgs.update("o1", { name: "B" }),
    method: "PATCH",
    url: "/orgs/o1",
    body: { name: "B" },
  },
  {
    name: "orgs.delete",
    call: (c) => c.orgs.delete("o1"),
    method: "DELETE",
    url: "/orgs/o1",
  },

  // projects
  {
    name: "projects.list",
    call: (c) => c.projects.list(),
    method: "GET",
    url: "/projects",
  },
  {
    name: "projects.listByOrg",
    call: (c) => c.projects.listByOrg("o1"),
    method: "GET",
    url: "/orgs/o1/projects",
  },
  {
    name: "projects.findById",
    call: (c) => c.projects.findById("p1"),
    method: "GET",
    url: "/projects/p1",
  },
  {
    name: "projects.create",
    call: (c) => c.projects.create("o1", { name: "Site" }),
    method: "POST",
    url: "/orgs/o1/projects",
    body: { name: "Site" },
  },
  {
    name: "projects.update",
    call: (c) => c.projects.update("p1", { name: "Site2" }),
    method: "PATCH",
    url: "/projects/p1",
    body: { name: "Site2" },
  },
  {
    name: "projects.delete",
    call: (c) => c.projects.delete("p1"),
    method: "DELETE",
    url: "/projects/p1",
  },

  // graph.nodes — a collection hangs off its scope's URL; by-id ops stay flat
  // and use the id only.
  {
    name: "graph.nodes.list (org)",
    call: (c) => c.graph.nodes.list({ type: "org", orgId: "o1" }),
    method: "GET",
    url: "/graph/nodes?orgId=o1",
  },
  {
    name: "graph.nodes.list (project, default hydrate)",
    call: (c) => c.graph.nodes.list({ type: "project", projectId: "p1" }),
    method: "GET",
    url: "/graph/nodes?projectId=p1",
  },
  {
    name: "graph.nodes.list (project, narrow to project-only)",
    call: (c) =>
      c.graph.nodes.list(
        { type: "project", projectId: "p1" },
        { scope: "project" }
      ),
    method: "GET",
    url: "/graph/nodes?projectId=p1&scope=project",
  },
  {
    name: "graph.nodes.list (project, filtered)",
    call: (c) =>
      c.graph.nodes.list(
        { type: "project", projectId: "p1" },
        { type: "object", limit: 25 }
      ),
    method: "GET",
    url: "/graph/nodes?projectId=p1&type=object&limit=25",
  },
  {
    name: "graph.nodes.get",
    call: (c) => c.graph.nodes.findById("n1"),
    method: "GET",
    url: "/graph/nodes/n1",
  },
  {
    name: "graph.nodes.get (with projection)",
    call: (c) =>
      c.graph.nodes.findById("n1", { select: ["envelope", "programme"] }),
    method: "GET",
    url: "/graph/nodes/n1?select=envelope&select=programme",
  },
  {
    name: "graph.nodes.create (org) — sugar over the org changeset",
    call: (c) =>
      c.graph.nodes.create(
        { type: "org", orgId: "o1" },
        { type: "source", class: "source.law.lbo_bw", name: "LBO BW" }
      ),
    method: "POST",
    url: "/graph?orgId=o1",
    body: {
      nodes: [
        {
          op: "create",
          type: "source",
          class: "source.law.lbo_bw",
          name: "LBO BW",
        },
      ],
    },
  },
  {
    name: "graph.nodes.create (project) — sugar over the project changeset",
    call: (c) =>
      c.graph.nodes.create(
        { type: "project", projectId: "p1" },
        {
          type: "object",
          class: "space.residential.bathroom",
          name: "Bathroom",
        }
      ),
    method: "POST",
    url: "/graph?projectId=p1",
    body: {
      nodes: [
        {
          op: "create",
          type: "object",
          class: "space.residential.bathroom",
          name: "Bathroom",
        },
      ],
    },
  },
  {
    name: "graph.nodes.update — sugar over the changeset",
    call: (c) =>
      c.graph.nodes.update({ type: "org", orgId: "o1" }, "n1", {
        name: "Renamed",
      }),
    method: "POST",
    url: "/graph?orgId=o1",
    body: {
      nodes: [{ op: "update", id: "n1", name: "Renamed" }],
    },
  },
  {
    name: "graph.nodes.delete — sugar over the changeset",
    call: (c) => c.graph.nodes.delete({ type: "org", orgId: "o1" }, "n1"),
    method: "POST",
    url: "/graph?orgId=o1",
    body: {
      nodes: [{ op: "delete", id: "n1" }],
    },
  },

  // graph.edges — same shape.
  {
    name: "graph.edges.list (org)",
    call: (c) => c.graph.edges.list({ type: "org", orgId: "o1" }),
    method: "GET",
    url: "/graph/edges?orgId=o1",
  },
  {
    name: "graph.edges.list (project, filtered by source)",
    call: (c) =>
      c.graph.edges.list(
        { type: "project", projectId: "p1" },
        { sourceId: "n1" }
      ),
    method: "GET",
    url: "/graph/edges?projectId=p1&sourceId=n1",
  },
  {
    name: "graph.edges.get",
    call: (c) => c.graph.edges.findById("e1"),
    method: "GET",
    url: "/graph/edges/e1",
  },
  {
    name: "graph.edges.create (project, cross-scope bind) — sugar over the changeset",
    call: (c) =>
      c.graph.edges.create(
        { type: "project", projectId: "p1" },
        { sourceId: "n1", targetId: "n2", type: "serves" }
      ),
    method: "POST",
    url: "/graph?projectId=p1",
    body: {
      edges: [
        {
          op: "create",
          sourceId: "n1",
          targetId: "n2",
          type: "serves",
        },
      ],
    },
  },
  {
    name: "graph.edges.update — sugar over the changeset",
    call: (c) =>
      c.graph.edges.update({ type: "project", projectId: "p1" }, "e1", {
        type: "bounds",
      }),
    method: "POST",
    url: "/graph?projectId=p1",
    body: {
      edges: [{ op: "update", id: "e1", type: "bounds" }],
    },
  },
  {
    name: "graph.edges.delete — sugar over the changeset",
    call: (c) =>
      c.graph.edges.delete({ type: "project", projectId: "p1" }, "e1"),
    method: "POST",
    url: "/graph?projectId=p1",
    body: {
      edges: [{ op: "delete", id: "e1" }],
    },
  },
  {
    name: "graph.apply (mixed changeset, edge references same-batch node)",
    call: (c) =>
      c.graph.apply(
        { type: "project", projectId: "p1" },
        {
          nodes: [
            {
              op: "create",
              id: "n1",
              type: "object",
              class: "space",
              name: "Room",
            },
          ],
          edges: [
            { op: "create", sourceId: "n1", targetId: "n2", type: "contains" },
          ],
        }
      ),
    method: "POST",
    url: "/graph?projectId=p1",
    body: {
      nodes: [
        {
          op: "create",
          id: "n1",
          type: "object",
          class: "space",
          name: "Room",
        },
      ],
      edges: [
        { op: "create", sourceId: "n1", targetId: "n2", type: "contains" },
      ],
    },
  },

  // files — same split: the collection nests, the by-id family does not.
  {
    name: "files.list (org library)",
    call: (c) => c.files.list({ type: "org", orgId: "o1" }),
    method: "GET",
    url: "/files?orgId=o1",
  },
  {
    name: "files.list (project, browsing a folder)",
    call: (c) =>
      c.files.list({ type: "project", projectId: "p1" }, { parentId: "f1" }),
    method: "GET",
    url: "/files?projectId=p1&parentId=f1",
  },
  {
    name: "files.createFolder (org library)",
    call: (c) =>
      c.files.createFolder({ type: "org", orgId: "o1" }, { name: "Standards" }),
    method: "POST",
    url: "/files?orgId=o1",
    body: { type: "folder", name: "Standards" },
  },
  {
    name: "files.get",
    call: (c) => c.files.findById("f1"),
    method: "GET",
    url: "/files/f1",
  },
  {
    name: "files.download",
    call: (c) => c.files.download("f1"),
    method: "GET",
    url: "/files/f1/download",
  },

  // graph.query — project-scoped, since the projection is filtered through the
  // injected $orgId / $projectId.
  {
    name: "graph.query.run",
    call: (c) => c.graph.query.run("p1", { query: "MATCH (n) RETURN n" }),
    method: "POST",
    url: "/graph/query?projectId=p1",
    body: { query: "MATCH (n) RETURN n" },
  },
  {
    name: "graph.query.health",
    call: (c) => c.graph.query.health("p1"),
    method: "GET",
    url: "/graph/health?projectId=p1",
  },
];

describe("PlatformClient request shape", () => {
  for (const c of cases) {
    it(c.name, async () => {
      // Write sugar (create/update/upsert) unwraps `res.{nodes,edges}.items[0]`,
      // so the mock returns a changeset-shaped body; reads ignore it.
      const okBody = JSON.stringify({
        nodes: {
          items: [{ id: "n1" }],
          summary: { created: 0, updated: 0, deleted: 0, skipped: 0 },
        },
        edges: {
          items: [{ id: "e1" }],
          summary: { created: 0, updated: 0, deleted: 0, skipped: 0 },
        },
      });
      const fetchMock = vi.fn<typeof fetch>(
        async () => new Response(okBody, { status: 200 })
      );
      const client = new PlatformClient({
        baseUrl: "https://api.test",
        fetch: fetchMock,
      });
      await c.call(client);
      expect(fetchMock).toHaveBeenCalledOnce();
      const call = fetchMock.mock.calls[0];
      expect(call).toBeDefined();
      const [url, init] = call as [string, RequestInit];
      expect(url).toBe(`https://api.test${c.url}`);
      expect(init.method).toBe(c.method);
      if (c.body === undefined) {
        expect(init.body).toBeUndefined();
      } else {
        expect(init.body).toBe(JSON.stringify(c.body));
      }
    });
  }
});

/**
 * The declared content type is what presets are checked against, and the server
 * reads the extension when the declaration is the generic type. A browser reports
 * the empty string for an extension it does not know, which is every AEC exchange
 * format, and `""` is a declared type of no length: the schema refuses it, and
 * the field cannot be dropped either, since a create without one is refused too.
 */
describe("upload create body", () => {
  const refuse = () =>
    vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "VALIDATION_FAILED", message: "stop here" },
          }),
          { status: 400 }
        )
    );

  const createBody = async (file: File): Promise<Record<string, unknown>> => {
    const fetchMock = refuse();
    const client = new PlatformClient({
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });
    const upload = client.files.upload(
      { type: "project", projectId: "p1" },
      file
    );
    await upload.done.catch(() => undefined);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  };

  it("declares the generic type when the browser could not name one", async () => {
    const body = await createBody(
      new File([new Uint8Array(4)], "model.ifc", { type: "" })
    );
    expect(body.contentType).toBe("application/octet-stream");
    expect(body.name).toBe("model.ifc");
  });

  it("declares the type the browser did name", async () => {
    const body = await createBody(
      new File([new Uint8Array(4)], "plan.png", { type: "image/png" })
    );
    expect(body.contentType).toBe("image/png");
  });
});
