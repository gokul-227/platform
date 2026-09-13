import type { ApiDocumentSpec } from "@aec-craft/platform-common/nest";

import { AuditApiModule } from "../config/api.module";
import { AuditEventModule } from "../modules/events/audit.event.module";

export const auditApiDocument: ApiDocumentSpec = {
  include: [AuditApiModule, AuditEventModule],
  path: "openapi-audit",
  sourceTitle: "Audit",
  title: "Audit API",
  tags: [
    {
      name: "Audit events",
      description:
        "Read-only feed of state-changing actions, addressed by scope: `?orgId=` reads an organization and every project under it, `?projectId=` reads one project. Who did what, when, and against which resource. The actor is `actorId`, the platform's own `user.id` rather than the identity subject, so the trail keeps naming the same person across an identity-provider swap; it is null when no person acted and `actorType` says which. Rows are immutable and written transactionally with the canonical mutation, so the log cannot drift from reality.",
    },
  ],
};
