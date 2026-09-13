import { Module } from "@nestjs/common";

import { RuleExtractionModule } from "./extractions/rule.extraction.module";
import { RuleCollectionController } from "./rule.controller";
import { RuleService } from "./rule.service";

@Module({
  imports: [RuleExtractionModule],
  controllers: [RuleCollectionController],
  providers: [RuleService],
  exports: [RuleExtractionModule, RuleService],
})
export class RuleModule {}
