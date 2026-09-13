import { describe, expect, it } from "vitest";

import { ObjectErrors } from "../../src/modules/object.errors";
import { ObjectService } from "../../src/modules/object.service";

/**
 * What this package adds to `GraphNodeTypeService`, which is two constants.
 * The narrowing and the translation those constants drive are the base class's,
 * and are tested once in graph-api rather than in every facade.
 */
describe("ObjectService", () => {
  const service = new ObjectService(
    null as never,
    null as never
  ) as unknown as {
    nodeType: string;
    notFound: { code: string };
  };

  it("presents the object half of the graph", () => {
    expect(service.nodeType).toBe("object");
  });

  it("refuses with its own code, never the store's", () => {
    expect(service.notFound).toBe(ObjectErrors.NOT_FOUND);
    expect(service.notFound.code).toBe("OBJECT_NOT_FOUND");
  });
});
