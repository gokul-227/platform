import { Module } from "@nestjs/common";

import { RuleExtractionModule } from "../modules/extractions/rule.extraction.module";
import { RuleModule } from "../modules/rule.module";

/**
 * Nothing to configure: this package owns no tables. It reads the rule half of
 * `graph_node` through the graph slice, so `GraphApiModule` must be registered.
 */
@Module({
  // Extractions first, deliberately: `GET /rules/extractions` and
  // `GET /rules/:ruleId` are the same shape to a router, and whichever
  // registers first wins. Registered second, the list would arrive at the by-id
  // read as a rule called "extractions".
  imports: [RuleExtractionModule, RuleModule],
  exports: [RuleModule],
})
export class RulesApiModule {}
