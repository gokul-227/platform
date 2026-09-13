import { Module } from "@nestjs/common";

import { RuleExtractionController } from "./rule.extraction.controller";
import { RuleExtractionService } from "./rule.extraction.service";

@Module({
  controllers: [RuleExtractionController],
  providers: [RuleExtractionService],
  exports: [RuleExtractionService],
})
export class RuleExtractionModule {}
