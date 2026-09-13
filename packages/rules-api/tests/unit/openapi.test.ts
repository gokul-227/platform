import { describe, expect, it } from "vitest";

import { RulesApiModule } from "../../src/config/api.module";
import { RuleExtractionModule } from "../../src/modules/extractions/rule.extraction.module";
import { RuleModule } from "../../src/modules/rule.module";
import { rulesApiDocument } from "../../src/nest/openapi";

describe("rulesApiDocument", () => {
  it("serves its own portal path", () => {
    expect(rulesApiDocument.path).toBe("openapi-rules");
  });

  it("names every controller-bearing module, the nested one included", () => {
    // `deepScanRoutes` reaches one level past an entry and stops, so the
    // extraction submodule has to be named or its five routes go undocumented.
    expect(rulesApiDocument.include).toContain(RulesApiModule);
    expect(rulesApiDocument.include).toContain(RuleModule);
    expect(rulesApiDocument.include).toContain(RuleExtractionModule);
  });

  it("tags the resource and its submodule separately", () => {
    expect(rulesApiDocument.tags?.map((tag) => tag.name)).toEqual([
      "Rules",
      "Rule extraction",
    ]);
  });
});

describe("RulesApiModule", () => {
  it("takes no configuration, because the package owns no table", () => {
    expect(RulesApiModule).toBeDefined();
    expect((RulesApiModule as { forRoot?: unknown }).forRoot).toBeUndefined();
  });
});
