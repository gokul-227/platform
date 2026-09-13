import {
  type ApiDocumentSpec,
  LIST_FILTER_TAG,
} from "@aec-craft/platform-common/nest";
import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { VersionController } from "./version.controller";

/** Host-owned `/health`, `/ready`, `/version`. */
@Module({
  controllers: [HealthController, VersionController],
})
export class HealthModule {}

/**
 * The host's own docs source: probes, build identity, and the portal-wide
 * conventions (the shared filter/sort/pagination grammar lives here once,
 * not on every package document).
 */
export const hostApiDocument: ApiDocumentSpec = {
  include: [HealthModule],
  path: "openapi",
  sourceTitle: "Platform",
  title: "Platform API",
  tags: [
    LIST_FILTER_TAG,
    {
      name: "Health",
      description:
        "Liveness and readiness probes used by orchestrators and load balancers. Public — no authentication required.",
    },
    {
      name: "Version",
      description:
        "Build identity for the running service — version, commit, and build time. Useful for confirming which build is live. Public — no authentication required.",
    },
  ],
};
