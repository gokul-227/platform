import type { ApiDocumentSpec } from "@aec-craft/platform-common/nest";

import { TenancyApiModule } from "../config/api.module";
import { OrgMemberModule } from "../modules/orgs/members/org.member.module";
import { OrgMetadataModule } from "../modules/orgs/metadata/org.metadata.module";
import { OrgModule } from "../modules/orgs/org.module";
import { ProjectMemberModule } from "../modules/projects/members/project.member.module";
import { ProjectMetadataModule } from "../modules/projects/metadata/project.metadata.module";
import { ProjectModule } from "../modules/projects/project.module";

export const tenancyApiDocument: ApiDocumentSpec = {
  include: [
    TenancyApiModule,
    OrgModule,
    OrgMetadataModule,
    OrgMemberModule,
    ProjectModule,
    ProjectMetadataModule,
    ProjectMemberModule,
  ],
  path: "openapi-tenancy",
  sourceTitle: "Tenancy",
  title: "Tenancy API",
  tags: [
    {
      name: "Orgs",
      description:
        "Organizations are the top-level tenant. Every project belongs to one. Anyone signed in can list the organizations they can reach and create a new one, becoming its owner; reading or changing an existing one needs a standing in it.",
    },
    {
      name: "Projects",
      description:
        "Projects are the delivery boundary inside an organization. Organization staff reach a project by default, and withholding that is how a project only its assigned people should see is made.",
    },
    {
      name: "Org members",
      description:
        "Who is in an organization, and the standing each holds: owner, admin, manager, editor or viewer, resolving to the permits read, write, manage, admin and own, where write covers update and delete alike. You may only grant strictly below your own standing, so a manager hands out editors and viewers and never another manager; owners are the exception and may appoint a peer. Changing a standing is delete-then-write in one call, because holding two at once reads as a promotion that did not take.",
    },
    {
      name: "Project members",
      description:
        "Who is on a project. The same five standings, plus the people the organization carries into it: a standing traverses down, so whoever administers the tenant administers the project without appearing to have been added. Those rows read `inherited` and are changed on the organization, which is where they live.",
    },
  ],
};
