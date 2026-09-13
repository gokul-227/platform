import { type DynamicModule, Global, Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { FileModule } from "../modules/file.module";

import { type ConfigInput, ConfigToken, parseConfig } from "./config";

/**
 * Requires `AuthorizationModule`, which is what makes `@RequirePermit` work.
 *
 * Without `fileStorage` the byte routes answer 503; without `documentIndex` the
 * index routes do. Everything else keeps working.
 */
@Global()
@Module({})
export class FilesApiModule {
  static forRoot(input: ConfigInput): DynamicModule {
    const config = parseConfig(input);
    return {
      module: FilesApiModule,
      imports: [DatabaseModule, FileModule],
      providers: [{ provide: ConfigToken, useValue: config }],
      exports: [ConfigToken, DatabaseModule, FileModule],
    };
  }
}
