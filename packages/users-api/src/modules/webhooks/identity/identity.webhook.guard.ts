import { timingSafeEqual } from "node:crypto";
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
import { type Config, ConfigToken } from "../../../config/config";

/**
 * The `Authorization: Bearer <secret>` header on the provider's webhook calls,
 * compared in constant time so a length or first-byte leak is not usable. With
 * no secret configured every request is rejected rather than let past.
 *
 * "No secret configured" and "wrong secret" answer the same 401, so neither is
 * an oracle.
 */
@Injectable()
export class IdentityWebhookGuard implements CanActivate {
  constructor(@Inject(ConfigToken) private readonly config: Config) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.identityWebhookSecret;
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const header = req.headers.authorization ?? "";
    const presented = header.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : "";

    if (
      !expected ||
      presented.length === 0 ||
      !constantTimeEqual(presented, expected)
    ) {
      throw new PlatformError(AuthenticationErrors.PRINCIPAL_REQUIRED);
    }
    return true;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  // timingSafeEqual requires equal-length buffers; the length check leaks only
  // length, exactly as the byte-wise loop it replaces did.
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
