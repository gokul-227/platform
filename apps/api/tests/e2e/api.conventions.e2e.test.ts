import { bootstrapTestApp, dbAvailable } from "@aec-craft/platform-testing";
import type { INestApplication } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { DiscoveryService } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { API_DOCUMENTS, documentScanOptions } from "../../src/openapi";

/**
 * That the API surface still obeys its own conventions.
 *
 * Every assertion here replaces a defect found by hand: a module left out of an
 * `include:` array and serving undocumented routes, four routes answering 401
 * without declaring it, a package publishing operations with no success
 * response, a path parameter named unlike every other one. None of those is
 * visible from a passing build, and each is the kind of thing that returns the
 * next time a package is added.
 *
 * Asserted over the generated documents rather than the source, because the
 * document is what a client is built from and the source is only how it got
 * there.
 */
/**
 * Machine-to-machine receivers, deliberately outside the published surface: the
 * identity provider posts here with its own shared secret, and nobody writes a
 * client against it. Excluded by name so the absence is a decision rather than a
 * module somebody forgot to include.
 */
const UNPUBLISHED = new Set([
  "POST /webhooks/identity",
  "DELETE /webhooks/identity/{externalId}",
]);

describe.skipIf(!dbAvailable())("api conventions (e2e)", () => {
  let app: INestApplication;
  let operations: Operation[];
  let documented: Set<string>;

  beforeAll(async () => {
    ({ app } = await bootstrapTestApp());
    operations = buildDocuments(app as NestExpressApplication);
    documented = new Set(operations.map((op) => `${op.method} ${op.path}`));
  });

  afterAll(async () => {
    await app.close();
  });

  it("publishes every route the app mounts", () => {
    const mounted = mountedRoutes(app);
    // Guards the enumeration: a discovery change returning nothing would
    // otherwise pass as "everything is documented".
    expect(mounted.length).toBeGreaterThan(50);
    expect(
      mounted.filter(
        (route) => !(documented.has(route) || UNPUBLISHED.has(route))
      )
    ).toEqual([]);
  });

  it("publishes each route in exactly one document", () => {
    const seen = new Map<string, number>();
    for (const op of operations) {
      const key = `${op.method} ${op.path}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect([...seen].filter(([, n]) => n > 1).map(([key]) => key)).toEqual([]);
  });

  it("declares the 401 every authenticated route can answer", () => {
    expect(
      operations.filter((op) => !op.codes.includes("401")).map((op) => op.where)
    ).toEqual([]);
  });

  it("declares a success response, with a schema unless it is 204", () => {
    const missing = operations.filter((op) => {
      // A scaffold declares 501 and nothing to succeed with; that is the honest
      // shape for a route whose answer has not been designed yet.
      if (op.codes.includes("501")) {
        return false;
      }
      const ok = op.codes.filter((code) => code.startsWith("2"));
      if (ok.length === 0) {
        return true;
      }
      // 204 carries no body, and a stream is not JSON.
      return ok.some(
        (code) => code !== "204" && !(op.hasSchema(code) || op.isStream)
      );
    });
    expect(missing.map((op) => op.where)).toEqual([]);
  });

  it("names every path parameter `<noun>Id`", () => {
    const ALLOWED = /^([a-z][A-Za-z]*Id|keyPath)$/;
    const bad = operations.flatMap((op) =>
      [...op.path.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1] as string)
        .filter((name) => !ALLOWED.test(name))
        .map((name) => `${op.where} {${name}}`)
    );
    expect(bad).toEqual([]);
  });

  it("names a collection in the plural", () => {
    // A segment with a `{param}` child is a collection you address into, so it
    // reads plural — `/audit/events/{eventId}`, not `/audit/{auditId}`. A
    // singleton has no `{param}` child and stays singular (`/me`,
    // `/projects/{projectId}/graph`, `/files/{fileId}/index`).
    const SINGULAR_BY_DESIGN = new Set([
      // A keyed map on its parent, not a collection: "metadata" is uncountable
      // and there is no list.
      "metadata",
    ]);
    const collections = new Set<string>();
    for (const op of operations) {
      const segs = op.path.split("/").filter(Boolean);
      for (const [i, seg] of segs.entries()) {
        const next = segs[i + 1];
        if (!seg.startsWith("{") && next?.startsWith("{")) {
          collections.add(seg);
        }
      }
    }
    expect(collections.size).toBeGreaterThan(8);
    expect(
      [...collections]
        .filter((seg) => !(seg.endsWith("s") || SINGULAR_BY_DESIGN.has(seg)))
        .sort()
    ).toEqual([]);
  });

  it("summarises every operation as a verb phrase", () => {
    // A noun-phrase summary reads as a heading in a portal that lists these
    // side by side; the estate settled on `<Verb> <object>`.
    const VERB =
      /^(Get|List|Create|Update|Delete|Set|Add|Remove|Apply|Start|Run|Find|Check|Measure|Total|Compare|Route|Search|Ask|Build|Retrieve|Submit|Cancel|Append|Confirm|Abandon|Rename|Resolve|Stream|Answer|Extract|Change)\b/;
    expect(
      operations
        .filter((op) => !VERB.test(op.summary))
        .map((op) => `${op.where} "${op.summary}"`)
    ).toEqual([]);
  });

  it("returns collections under `items`", () => {
    const bad = operations.filter((op) => {
      const schema = op.successSchema();
      if (!schema?.properties) {
        return false;
      }
      const keys = Object.keys(schema.properties);
      return keys.includes("data") && !keys.includes("items");
    });
    expect(bad.map((op) => op.where)).toEqual([]);
  });
});

interface Operation {
  codes: string[];
  hasSchema: (code: string) => boolean;
  isStream: boolean;
  method: string;
  path: string;
  successSchema: () => { properties?: Record<string, unknown> } | undefined;
  summary: string;
  where: string;
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** The operations of every published document, flattened. */
function buildDocuments(app: NestExpressApplication): Operation[] {
  const out: Operation[] = [];
  for (const spec of API_DOCUMENTS) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle(spec.title).setVersion("test").build(),
      documentScanOptions(spec)
    );
    for (const [path, item] of Object.entries(document.paths ?? {})) {
      for (const method of METHODS) {
        const op = (item as Record<string, unknown>)[method] as
          | {
              responses?: Record<string, { content?: Record<string, unknown> }>;
              summary?: string;
            }
          | undefined;
        if (!op) {
          continue;
        }
        const responses = op.responses ?? {};
        const schemaOf = (code: string) =>
          (
            responses[code]?.content?.["application/json"] as
              | { schema?: { properties?: Record<string, unknown> } }
              | undefined
          )?.schema;
        out.push({
          codes: Object.keys(responses),
          hasSchema: (code) => schemaOf(code) !== undefined,
          isStream: path.endsWith("/stream"),
          method: method.toUpperCase(),
          path,
          summary: op.summary ?? "",
          successSchema: () =>
            schemaOf(
              Object.keys(responses).find((c) => c.startsWith("2")) ?? "200"
            ),
          where: `${method.toUpperCase()} ${path}`,
        });
      }
    }
  }
  return out;
}

/** `METHOD /path` for every route bound on the app, in OpenAPI's brace form. */
function mountedRoutes(app: INestApplication): string[] {
  const out: string[] = [];
  for (const wrapper of app.get(DiscoveryService).getControllers()) {
    const { metatype } = wrapper;
    if (!metatype) {
      continue;
    }
    const base = (Reflect.getMetadata(PATH_METADATA, metatype) ?? "") as string;
    const { prototype } = metatype;
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === "constructor") {
        continue;
      }
      const handler = prototype[name];
      const suffix = Reflect.getMetadata(PATH_METADATA, handler) as
        | string
        | undefined;
      const verb = Reflect.getMetadata("method", handler) as number | undefined;
      if (suffix === undefined || verb === undefined) {
        continue;
      }
      const path = `/${[base, suffix].filter((s) => s && s !== "/").join("/")}`;
      out.push(
        `${REQUEST_METHODS[verb] ?? "GET"} ${path.replace(/:(\w+)/g, "{$1}")}`
      );
    }
  }
  return out;
}

/** Nest's `RequestMethod` enum, by ordinal. */
const REQUEST_METHODS: Record<number, string> = {
  0: "GET",
  1: "POST",
  2: "PUT",
  3: "DELETE",
  4: "PATCH",
};
