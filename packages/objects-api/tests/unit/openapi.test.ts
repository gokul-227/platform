import { describe, expect, it } from "vitest";

import { ObjectsApiModule } from "../../src/config/api.module";
import { ObjectModule } from "../../src/modules/object.module";
import { objectsApiDocument } from "../../src/nest/openapi";

describe("objectsApiDocument", () => {
  it("serves its own portal path", () => {
    expect(objectsApiDocument.path).toBe("openapi-objects");
  });

  it("names every controller-bearing module, not just the root", () => {
    // `deepScanRoutes` reaches one level past an entry and stops, so a module
    // left out here has its routes silently absent from the document.
    expect(objectsApiDocument.include).toContain(ObjectsApiModule);
    expect(objectsApiDocument.include).toContain(ObjectModule);
  });

  it("tags the resource by the segment it serves", () => {
    expect(objectsApiDocument.tags?.map((tag) => tag.name)).toEqual([
      "Objects",
    ]);
  });
});

describe("ObjectsApiModule", () => {
  it("takes no configuration, because the package owns no table", () => {
    expect(ObjectsApiModule).toBeDefined();
    expect((ObjectsApiModule as { forRoot?: unknown }).forRoot).toBeUndefined();
  });
});
