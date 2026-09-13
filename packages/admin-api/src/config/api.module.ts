import { Module } from "@nestjs/common";

import { AdminOrgMemberModule } from "../modules/orgs/members/org.member.module";
import { AdminOrgModule } from "../modules/orgs/org.module";
import { AdminProjectModule } from "../modules/projects/project.module";
import { AdminUserModule } from "../modules/users/user.module";

/**
 * Nothing to configure: this package owns no tables. Every route delegates to
 * the package that owns the row, so `TenancyApiModule` and `UsersApiModule`
 * must be registered.
 */
@Module({
  imports: [
    AdminOrgMemberModule,
    AdminOrgModule,
    AdminProjectModule,
    AdminUserModule,
  ],
  exports: [
    AdminOrgMemberModule,
    AdminOrgModule,
    AdminProjectModule,
    AdminUserModule,
  ],
})
export class AdminApiModule {}
