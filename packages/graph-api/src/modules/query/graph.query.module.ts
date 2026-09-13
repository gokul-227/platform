import { Module } from "@nestjs/common";
import { GraphCommonModule } from "../graph.common.module";

import { GraphQueryController } from "./graph.query.controller";
import { GraphQueryService } from "./graph.query.service";

/**
 * Analytical query routes over the projected graph DB. Part of the gated
 * import set in `PlatformModule.forRoot`: no `config.graphDatabase`, no
 * routes (404), no driver.
 */
@Module({
  imports: [GraphCommonModule],
  controllers: [GraphQueryController],
  providers: [GraphQueryService],
  exports: [GraphQueryService],
})
export class GraphQueryModule {}
