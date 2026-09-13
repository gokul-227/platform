import { describe, expect, it } from "vitest";

import { RuleErrors } from "../../src/modules/rule.errors";
import { RuleService } from "../../src/modules/rule.service";

/**
 * What this package adds to `GraphNodeTypeService`, which is two constants.
 * The narrowing and the translation those constants drive are the base class's,
 * and are tested once in graph-api rather than in every facade.
 */
describe("RuleService", () => {
  const service = new RuleService(null as never, null as never) as unknown as {
    nodeType: string;
    notFound: { code: string };
  };

  it("presents the rule half of the graph", () => {
    expect(service.nodeType).toBe("rule");
  });

  it("refuses with its own code, never the store's", () => {
    expect(service.notFound).toBe(RuleErrors.NOT_FOUND);
    expect(service.notFound.code).toBe("RULE_NOT_FOUND");
  });
});
