import { PlatformError } from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { MemberErrors } from "./member.errors";

/**
 * Nobody administers the standing they hold: every self-change is somebody
 * giving up the reach that would undo it. Scoped to a standing already held, so
 * placing yourself where you only reach from above is still allowed.
 */
export function assertNotSelfStanding(
  principal: Principal,
  subject: string
): void {
  if (principal.subject === subject) {
    throw new PlatformError(MemberErrors.SELF);
  }
}
