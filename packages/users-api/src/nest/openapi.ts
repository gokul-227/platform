import type { ApiDocumentSpec } from "@aec-craft/platform-common/nest";

import { UsersApiModule } from "../config/api.module";
import { MeGroupModule } from "../modules/me/groups/me.group.module";
import { MeModule } from "../modules/me/me.module";
import { MeMetadataModule } from "../modules/me/metadata/me.metadata.module";
import { IdentityWebhookModule } from "../modules/webhooks/identity/identity.webhook.module";

export const usersApiDocument: ApiDocumentSpec = {
  include: [
    UsersApiModule,
    MeModule,
    MeGroupModule,
    MeMetadataModule,
    IdentityWebhookModule,
  ],
  path: "openapi-users",
  sourceTitle: "Users",
  title: "Users API",
  tags: [
    {
      name: "Me",
      description:
        "The signed-in user's own profile, and what they hold across a tenant. Available to anyone with a valid token; no special role required. The standings list is resolved as permits rather than as membership rows, because a standing reaches a group down the parent chain and a surface keyed on the row would hide controls its user is entitled to.",
    },
  ],
};
