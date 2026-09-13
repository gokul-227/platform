import { bootstrapTestApp, dbAvailable } from "@aec-craft/platform-testing";
import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { API_DOCUMENTS, documentScanOptions } from "../../src/openapi";

/**
 * That every tag a document declares has operations behind it.
 *
 * A document is bounded by `include`, and `deepScanRoutes` reaches the modules
 * those import and stops there. So a package that nests a module deeper still
 * renders its tags in the portal, as headings with nothing under them, while the
 * routes are simply absent: the docs claim less than the API does and no build
 * step notices. That is what happened to the whole document-index ladder, which
 * shipped with three tags and no paths.
 *
 * Rebuilt through `documentScanOptions` so this reads the options the portal
 * serves rather than a copy that could drift from them.
 *
 * Only documents this app actually mounts are checked. A document with no paths
 * at all is a package the test app does not import (threads), which this suite
 * cannot say anything about; the fault it does catch is a document that carries
 * some of its routes and names groups for the rest.
 */
/** Documented grammar rather than a group of endpoints, so it owns no operations. */
const PROSE_TAGS = new Set(["Filtering, sorting and pagination"]);
describe.skipIf(!dbAvailable())("published api documents (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("every declared tag has at least one operation", () => {
    const empty: string[] = [];
    for (const spec of API_DOCUMENTS) {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
        documentScanOptions(spec)
      );
      const tagged = new Set(
        Object.values(document.paths ?? {}).flatMap((path) =>
          Object.values(path ?? {}).flatMap((operation) =>
            typeof operation === "object" && operation && "tags" in operation
              ? ((operation as { tags?: string[] }).tags ?? [])
              : []
          )
        )
      );
      if (Object.keys(document.paths ?? {}).length === 0) {
        continue;
      }
      for (const tag of spec.tags) {
        if (!(tagged.has(tag.name) || PROSE_TAGS.has(tag.name))) {
          empty.push(`${spec.path}: ${tag.name}`);
        }
      }
    }

    expect(empty).toEqual([]);
  });
});
