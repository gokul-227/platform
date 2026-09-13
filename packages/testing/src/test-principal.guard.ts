import {
  AuthenticationErrors,
  PlatformError,
} from "@aec-craft/platform-contracts";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

/**
 * Refuses a request that carries no principal, which is what the principal guard
 * does in the real host.
 *
 * The real one verifies a signature, and a test cannot produce one without
 * standing up the issuer. What a caller observes is identical: no principal,
 * `401`. Without this the test app would answer every unauthenticated request
 * as though it were anonymous-but-allowed, and a route that lost its
 * authentication would still pass.
 */
@Injectable()
export class TestPrincipalGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      "platform-id:public",
      [context.getHandler(), context.getClass()]
    );
    if (isPublic) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<{ principal?: unknown }>();
    if (!request.principal) {
      throw new PlatformError(AuthenticationErrors.PRINCIPAL_REQUIRED);
    }
    return true;
  }
}

/** Re-exported so a test route can opt out the way a real one does. */
export { Public } from "@aec-craft/platform-id-resource-nestjs";
