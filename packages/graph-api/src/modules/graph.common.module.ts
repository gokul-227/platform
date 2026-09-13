import { Module } from "@nestjs/common";

import { GraphVocabularyService } from "./graph.vocabulary.service";

/**
 * `GraphVocabularyService` lives here rather than in `GraphNodeModule` and
 * `GraphEdgeModule` so node and edge writes share one classifier and one
 * in-process counter. Nest instantiates a provider once per declaring module,
 * so declaring it in both would split the counter.
 */
@Module({
  providers: [GraphVocabularyService],
  exports: [GraphVocabularyService],
})
export class GraphCommonModule {}
