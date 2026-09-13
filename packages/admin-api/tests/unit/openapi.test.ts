import { describe, expect, it } from "vitest";

import { AdminApiModule } from "../../src/config/api.module";
import { AdminOrgModule } from "../../src/modules/orgs/org.module";
import { AdminProjectModule } from "../../src/modules/projects/project.module";
import { AdminUserModule } from "../../src/modules/users/user.module";
import { adminApiDocument } from "../../src/nest/openapi";

describe("adminApiDocument", () => {
  it("names every controller-bearing module, not just the root", () => {
    // `deepScanRoutes` reaches one level past an entry and stops, so a module
    // left out here has its routes silently absent from the document.
    expect(adminApiDocument.include).toEqual(
      expect.arrayContaining([
        AdminApiModule,
        AdminOrgModule,
        AdminProjectModule,
        AdminUserModule,
      ])
    );
  });

  it("publishes no portal, and is still generated", () => {
    // Both halves matter: the staff surface is not a product document, and a
    // module in no document at all is checked by no gate.
    expect(adminApiDocument.portal).toBe(false);
    expect(adminApiDocument.path).toBe("openapi-admin");
  });

  it("tags by entity, with no scope prefix: there is one scope, the estate", () => {
    expect(adminApiDocument.tags?.map((tag) => tag.name)).toEqual([
      "Orgs",
      "Projects",
      "Users",
    ]);
  });
});

describe("AdminApiModule", () => {
  it("takes no configuration, because the package owns no table", () => {
    expect((AdminApiModule as { forRoot?: unknown }).forRoot).toBeUndefined();
  });
});
