import type { Permit, ResolvedScope } from "@aec-craft/platform-contracts";
import {
  AuthorizationErrors,
  PlatformError,
} from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthorizationService } from "../authorization.service";
import { resolveScopeRef, type ScopeRequest } from "../scope";

export const RequiredPermitMetadataKey = Symbol.for(
  "@aec-craft/platform-authorization:required-permit"
);

export interface RequiredPermit {
  /** Dotted path to a group id, when the route names one somewhere unusual. */
  from?: string;
  permit: Permit;
}

/** The request as this guard reads it, plus what it leaves behind. */
export interface PermitRequest extends ScopeRequest {
  principal?: Principal;
  resolvedScope?: ResolvedScope;
}

/**
 * Job A: the request names its scope, in the path or the query.
 *
 *   @Post()
 *   @RequirePermit("write")
 */
export const RequirePermit = (
  permit: Permit,
  options: { from?: string } = {}
): MethodDecorator & ClassDecorator =>
  SetMetadata(RequiredPermitMetadataKey, { permit, ...options });

/** The scope the guard resolved, to stamp on a row a handler is about to write. */
export const CurrentScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ResolvedScope => {
    const request = context.switchToHttp().getRequest<PermitRequest>();
    const scope = request.resolvedScope;
    if (!scope) {
      throw new PlatformError(
        AuthorizationErrors.FORBIDDEN,
        "No resolved scope on the request: the route declares no permit."
      );
    }
    return scope;
  }
);

/**
 * Authorizes a route that names its scope up front, handing the handler the
 * resolved scope so a create stamps the right `group_id`.
 *
 * Runs after the host's global `PrincipalGuard`. A route with no
 * `@RequirePermit` passes straight through: authentication is already global and
 * fail-closed, and a by-id route authorizes from its row instead.
 */
@Injectable()
export class ScopePermitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      RequiredPermit | undefined
    >(RequiredPermitMetadataKey, [context.getHandler(), context.getClass()]);
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PermitRequest>();
    const principal = request.principal;
    if (!principal) {
      throw new PlatformError(AuthorizationErrors.FORBIDDEN);
    }

    // Guards run before the validation pipe, so the reference comes off the raw
    // request. Zod validates the body afterwards; the handler only ever sees the
    // scope authorized here.
    const ref = resolveScopeRef(request, required.from);
    const groupId = await this.checks.resolveGroup(ref);
    await this.checks.assertCanOrMask(
      principal,
      required.permit,
      groupId,
      this.checks.missingFor(ref)
    );
    request.resolvedScope = await this.checks.scopeFor({
      type: "group",
      groupId,
    });
    return true;
  }
}
