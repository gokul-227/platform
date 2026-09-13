import { GraphClientModule } from "@aec-craft/platform-graph-client";
import { type DynamicModule, Global, Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { GraphModule } from "../modules/graph.module";
import { GraphQueryModule } from "../modules/query/graph.query.module";
import { GraphSyncModule } from "../modules/sync/graph.sync.module";

import { type ConfigInput, ConfigToken, parseConfig } from "./config";

/**
 * Requires `AuthorizationModule`, which is what makes `@RequirePermit` work.
 *
 * `GraphClientModule` is bound here rather than by the host, because the
 * connection and the worker that fills it come from one config block. It is
 * global, so analysis-api injects the session without importing this package's
 * module. Without `graphDatabase` the driver is null: queries answer 503, the
 * sync worker stays dormant, and the `graph_version` feed accumulates.
 */
@Global()
@Module({})
export class GraphApiModule {
  static forRoot(input: ConfigInput): DynamicModule {
    const config = parseConfig(input);
    return {
      module: GraphApiModule,
      imports: [
        DatabaseModule,
        GraphModule,
        GraphClientModule.forRoot(config.graphDatabase),
        GraphSyncModule,
        GraphQueryModule,
      ],
      providers: [{ provide: ConfigToken, useValue: config }],
      exports: [
        ConfigToken,
        DatabaseModule,
        GraphModule,
        GraphClientModule.forRoot(config.graphDatabase),
        GraphSyncModule,
        GraphQueryModule,
      ],
    };
  }
}
