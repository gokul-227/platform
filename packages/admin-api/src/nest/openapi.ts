import type { ApiDocumentSpec } from "@aec-craft/platform-common/nest";

import { AdminApiModule } from "../config/api.module";
import { AdminOrgMemberModule } from "../modules/orgs/members/org.member.module";
import { AdminOrgModule } from "../modules/orgs/org.module";
import { AdminProjectModule } from "../modules/projects/project.module";
import { AdminUserModule } from "../modules/users/user.module";

/**
 * `portal: false` keeps this out of the Scalar sources and off `/openapi-admin`.
 * It stays in `API_DOCUMENTS` because the conventions and validation gates read
 * generated documents: a module in no document is checked by nothing.
 */
export const adminApiDocument: ApiDocumentSpec = {
  include: [
    AdminApiModule,
    AdminOrgMemberModule,
    AdminOrgModule,
    AdminProjectModule,
    AdminUserModule,
  ],
  path: "openapi-admin",
  portal: false,
  sourceTitle: "Admin",
  title: "Admin API",
  tags: [
    {
      name: "Orgs",
      description:
        "Every organization in the estate. Reachable only on a browser session the identity provider has marked as staff, because consent puts no console role into an OAuth grant. Reads are unbounded; a write takes the same transaction and leaves the same audit row the tenant's own admin would, naming the staff member as the actor. Creating and deleting a tenant are deliberately absent.",
    },
    {
      name: "Projects",
      description:
        "Every project in the estate, or every project in one tenant. Same gate and same audit trail as the organization routes. Creating a project would invent a customer's data and deleting one takes every group beneath it, so both are deliberately absent.",
    },
    {
      name: "Users",
      description:
        "Every person in the system, read-only. The one admin surface with no scoped counterpart: a person is not partitioned. No create, no delete and no role write, because the lifecycle belongs to the identity provider and what somebody may do is a standing on a group.",
    },
  ],
};
