import {
  AuthorizationErrors,
  PlatformError,
} from "@aec-craft/platform-contracts";
import {
  meetsAal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UseGuards,
} from "@nestjs/common";

import { type Config, ConfigToken } from "../config/config";

/**
 * The staff gate: a caller the identity provider has marked as staff.
 *
 * `staffRole` is written into `metadata_public` by the Kratos admin API and
 * nowhere else, so it cannot be self-granted. That is why this replaced a
 * `user.role` column: a second notion of admin in our own database is one that
 * can disagree with the identity provider's, and the one that disagrees is the
 * one that gets exploited.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(@Inject(ConfigToken) private readonly config: Config) {}

  canActivate(context: ExecutionContext): boolean {
    const { principal } = context
      .switchToHttp()
      .getRequest<{ principal?: Principal }>();
    if (!(principal && isStaff(principal, this.config))) {
      throw new PlatformError(AuthorizationErrors.STAFF_REQUIRED);
    }
    return true;
  }
}

/** Hydra nests consent claims under `ext`; a flat one still wins. */
function identitySchemaOf(principal: Principal): string | null {
  const flat = principal.claims.schema;
  if (typeof flat === "string" && flat.length > 0) {
    return flat;
  }
  const ext = principal.claims.ext;
  if (ext && typeof ext === "object") {
    const nested = (ext as Record<string, unknown>).schema;
    if (typeof nested === "string" && nested.length > 0) {
      return nested;
    }
  }
  return null;
}

/**
 * Staff, and permitted to operate this estate: both, and `aal2` on every path.
 *
 * This used to admit any principal carrying a `staffRole` before checking
 * anything else, on the stated reasoning that the claim could not travel — the
 * identity provider's consent flow omitted it, so its presence meant a browser
 * session that had already been gated. Consent emits it now, nested under `ext`,
 * which turns that early return into a way past the assurance floor, the schema
 * and the `user` check at once. The reasoning was sound and the fact under it
 * moved.
 *
 * There is no root here, deliberately. A root holds `admin` like anyone who
 * administers; which addresses those are is the identity estate's question, and
 * this package reads the token and nothing else. Reading a second, configured
 * list would put the break-glass addresses in every resource server that ever
 * mounts a staff route.
 */
export function isStaff(principal: Principal, config: Config): boolean {
  if (principal.type !== "user" || !meetsAal(principal.aal, "aal2")) {
    return false;
  }
  return (
    identitySchemaOf(principal) === config.staffIdentitySchema &&
    config.staffRoles.includes(principal.staffRole ?? "")
  );
}

/**
 * The staff surface, declared like the other two.
 *
 * Class-wide on an admin controller, which then declares no permit: that pairing
 * is the whole authorization story for a staff route, so it must not be applied
 * per method.
 */
export const RequireStaff = (): ClassDecorator => UseGuards(StaffGuard);
