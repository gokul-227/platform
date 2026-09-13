import { type DynamicModule, Global, Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { AuditModule } from "../modules/audit.module";

import { type ConfigInput, ConfigToken, parseConfig } from "./config";

/** Requires `AuthorizationModule`, which is what makes `@RequirePermit` work. */
@Global()
@Module({})
export class AuditApiModule {
  static forRoot(input: ConfigInput): DynamicModule {
    const config = parseConfig(input);
    return {
      module: AuditApiModule,
      imports: [DatabaseModule, AuditModule],
      providers: [{ provide: ConfigToken, useValue: config }],
      exports: [ConfigToken, DatabaseModule, AuditModule],
    };
  }
}
