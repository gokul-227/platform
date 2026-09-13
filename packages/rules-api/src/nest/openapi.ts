import type { ApiDocumentSpec } from "@aec-craft/platform-common/nest";

import { RulesApiModule } from "../config/api.module";
import { RuleExtractionModule } from "../modules/extractions/rule.extraction.module";
import { RuleModule } from "../modules/rule.module";

export const rulesApiDocument: ApiDocumentSpec = {
  include: [RulesApiModule, RuleModule, RuleExtractionModule],
  path: "openapi-rules",
  sourceTitle: "Rules",
  title: "Rules API",
  tags: [
    {
      name: "Rules",
      description:
        "What a project must satisfy. A rule carries a selector saying what it applies to and a criterion saying what it demands, and reaches its subjects by matching class and property path rather than by an edge — which is why nothing here joins the building. Read a scope with `?orgId=` or `?projectId=`: an organisation's rules are its design intent, held once and hydrated into every project read the way an org file library is.",
    },
    {
      name: "Rule extraction",
      description:
        "Turning a document into rules, and reporting what it could not. Project-scoped throughout, because extraction grounds itself in the model the document describes. A run reads a document already in the files API, so nothing here takes text or touches storage. It reports coverage as well as results — one row per unit of source text with what became of it — because the denominator is the whole document rather than the part that worked, and a re-run extends rather than replaces so that improving the extractor does not destroy review work.",
    },
  ],
};
