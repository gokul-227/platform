import { type DynamicModule, Global, Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { ThreadModule } from "../modules/thread.module";

import { type ConfigInput, ConfigToken, parseConfig } from "./config";

/**
 * Requires `AuthorizationModule`, which is what makes `@RequirePermit` work.
 *
 * Without `llm` the run worker stays dormant and runs sit `queued`. Without the
 * host's `RunGraphSourceToken` the executor has no graph tools and the agent
 * answers from general knowledge.
 */
@Global()
@Module({})
export class ThreadsApiModule {
  static forRoot(input: ConfigInput): DynamicModule {
    const config = parseConfig(input);
    return {
      module: ThreadsApiModule,
      imports: [DatabaseModule, ThreadModule],
      providers: [{ provide: ConfigToken, useValue: config }],
      exports: [ConfigToken, DatabaseModule, ThreadModule],
    };
  }
}
