import { AdminClient } from "@aec-craft/platform-admin-sdk";
import { ALL_TOOLS } from "@aec-craft/platform-mcp-tools";
import { PlatformClient } from "@aec-craft/platform-sdk";
import { bootstrapTestApp, dbAvailable } from "@aec-craft/platform-testing";
import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_DOCUMENTS, documentScanOptions } from "../../src/openapi";

/**
 * Every published route has an SDK method, or is named below as one that
 * deliberately does not.
 *
 * The SDK half is observed rather than parsed: several clients build their path
 * through a helper (`scopePath`, `auditBasePath`, `ScopedMetadataClient`), so
 * reading the source finds a template with an interpolated segment and cannot
 * tell which route it is. Instead every method is invoked against a recording
 * transport and the URL it actually produces is collected.
 *
 * Methods are probed with a spread of placeholder argument shapes rather than
 * real ones. A method that throws before it reaches the transport contributes
 * nothing, which shows up here as an uncovered route — the failure asks for a
 * shape to be added, not for the list to grow.
 */

/** Routes with no SDK method, each for a stated reason. */
const UNCOVERED: ReadonlyArray<{ reason: string; route: string }> = [
  {
    route: "GET /threads/{threadId}/runs/{runId}/stream",
    reason:
      "server-sent events, read through `runs.stream` on the streaming transport rather than the JSON one",
  },
];

/**
 * One placeholder for every id-shaped argument, so a recorded URL canonicalises
 * back to the document's `{}`. A literal like `"key/path"` would not, which is
 * why every position gets the same uuid.
 */
const ID = "00000000-0000-4000-8000-000000000000";
const ARG_SHAPES: unknown[][] = [
  [],
  [{}],
  [ID],
  [ID, {}],
  [ID, ID],
  [ID, ID, {}],
  [ID, ID, ID],
  [ID, ID, ID, {}],
  [{ orgId: ID, type: "org" }],
  [{ orgId: ID, type: "org" }, {}],
  [{ projectId: ID, type: "project" }],
  [{ projectId: ID, type: "project" }, {}],
  [{ orgId: ID, type: "org" }, ID, {}],
  [{ projectId: ID, type: "project" }, ID, {}],
];

/** Placeholder ids back to `{}`, so a recorded URL compares to a document path. */
function canon(path: string): string {
  return (
    path
      .split("?")[0]
      ?.replaceAll(ID, "{}")
      .replace(/\{[^}]*\}/g, "{}")
      .replace(/\/+$/, "") || "/"
  );
}

/**
 * `files.upload` and `files.resume` hand back a running task rather than a
 * promise, so the transport's refusal lands on `done` after the probe has moved
 * on. Unclaimed, vitest reports it as an unhandled rejection and fails a run
 * whose assertions all passed.
 */
function settle(result: unknown): void {
  if (
    result &&
    typeof result === "object" &&
    "done" in result &&
    result.done instanceof Promise
  ) {
    result.done.catch(() => {
      // The recorder refuses every request; the URL is what was wanted.
    });
  }
}

async function probe(node: object, seen: Set<object>): Promise<void> {
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  for (const value of Object.values(node)) {
    if (typeof value === "function") {
      for (const args of ARG_SHAPES) {
        try {
          settle(
            await (value as (...a: unknown[]) => Promise<unknown>)(...args)
          );
        } catch {
          // Every call rejects: the transport records, then refuses. A method
          // that throws on the way in simply records nothing.
        }
      }
      continue;
    }
    // A sub-client is a property of its parent, and `threads.runs.metadata` is
    // three deep, so the walk recurses rather than assuming a depth.
    if (typeof value === "object" && value !== null) {
      await probe(value, seen);
    }
  }
}

async function observedRoutes(): Promise<Set<string>> {
  const routes = new Set<string>();
  const options = {
    baseUrl: "http://recorder.test",
    fetch: ((input: string, init?: RequestInit) => {
      const url = new URL(String(input));
      routes.add(`${init?.method ?? "GET"} ${canon(url.pathname)}`);
      return Promise.reject(new Error("recorded"));
    }) as unknown as typeof fetch,
  };

  const visited = new Set<object>();
  await probe(new PlatformClient(options) as unknown as object, visited);
  await probe(new AdminClient(options) as unknown as object, visited);
  return routes;
}

describe.skipIf(!dbAvailable())("sdk covers the published routes (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("has a method for every route it does not name as uncovered", async () => {
    const published: string[] = [];
    for (const spec of API_DOCUMENTS) {
      // The host document is health and metadata, not a client surface.
      if (spec.path === "openapi") {
        continue;
      }
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle(spec.title).build(),
        documentScanOptions(spec)
      );
      for (const [path, ops] of Object.entries(doc.paths ?? {})) {
        for (const verb of Object.keys(ops as object)) {
          published.push(`${verb.toUpperCase()} ${path}`);
        }
      }
    }

    const excused = new Set(UNCOVERED.map((entry) => entry.route));
    const observed = await observedRoutes();
    const gaps = published
      .filter((route) => !excused.has(route))
      .filter((route) => {
        const [verb, path] = route.split(" ");
        return !observed.has(`${verb} ${canon(path as string)}`);
      })
      .sort();

    expect(gaps).toEqual([]);
  });

  it("points every MCP tool at a route the server serves", async () => {
    const published = new Set<string>();
    for (const spec of API_DOCUMENTS) {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle(spec.title).build(),
        documentScanOptions(spec)
      );
      for (const [path, ops] of Object.entries(doc.paths ?? {})) {
        for (const verb of Object.keys(ops as object)) {
          published.add(`${verb.toUpperCase()} ${canon(path)}`);
        }
      }
    }

    // Only this direction. The MCP surface is deliberately a subset: no deletes,
    // no staff routes, nothing an agent should not reach. What must not happen
    // is a tool naming an endpoint that moved or went away, which is silent
    // until an agent calls it.
    const dangling = ALL_TOOLS.map(
      (tool) => `${tool.endpoint.method} ${tool.endpoint.path}`
    )
      .filter((route) => {
        const [verb, path] = route.split(" ");
        return !published.has(`${verb} ${canon(path as string)}`);
      })
      .sort();

    expect(dangling).toEqual([]);
  });

  it("names no route as uncovered that the server does not serve", async () => {
    const published = new Set<string>();
    for (const spec of API_DOCUMENTS) {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle(spec.title).build(),
        documentScanOptions(spec)
      );
      for (const [path, ops] of Object.entries(doc.paths ?? {})) {
        for (const verb of Object.keys(ops as object)) {
          published.add(`${verb.toUpperCase()} ${path}`);
        }
      }
    }
    const stale = UNCOVERED.map((e) => e.route).filter(
      (r) => !published.has(r)
    );
    expect(stale).toEqual([]);
  });
});
