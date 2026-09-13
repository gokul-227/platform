import { AuditWriter } from "@aec-craft/platform-audit-api";
import { type DynamicModule, Global, Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { MemberModule } from "../modules/members/member.module";
import { OrgModule } from "../modules/orgs/org.module";
import { ProjectModule } from "../modules/projects/project.module";

import { type ConfigInput, ConfigToken, parseConfig } from "./config";

/** Requires `AuthorizationModule`, which is what makes `@RequirePermit` work. */
@Global()
@Module({})
export class TenancyApiModule {
  static forRoot(input: ConfigInput): DynamicModule {
    const config = parseConfig(input);
    return {
      module: TenancyApiModule,
      imports: [DatabaseModule, MemberModule, OrgModule, ProjectModule],
      providers: [{ provide: ConfigToken, useValue: config }, AuditWriter],
      exports: [
        ConfigToken,
        DatabaseModule,
        MemberModule,
        OrgModule,
        ProjectModule,
        AuditWriter,
      ],
    };
  }
}
