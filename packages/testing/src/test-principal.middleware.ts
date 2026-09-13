import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

/**
 * Puts a principal on the request from a header, so an end-to-end test can act
 * as somebody without minting a real access token.
 *
 * Test-only and it stays here rather than in a package: shipping an affordance
 * that turns a header into an identity means shipping a way to forge one, and
 * the fact that it needs the app wired differently to work is the safeguard.
 * The real path verifies a signature and is covered by the verifier's own tests.
 *
 * `X-Test-Subject` is what authorization reads; the rest of the principal is
 * filled in with what a browser session would carry.
 *
 * `Authorization: Bearer test:<subject>` says the same thing, for the one hop
 * that cannot pass a header of its own: the MCP endpoint dispatches a tool call
 * back to the host carrying the caller's bearer token and nothing else, so
 * without this the inner request arrives as nobody.
 */
@Injectable()
export class TestPrincipalMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const subject = header(req, "x-test-subject") ?? bearerSubject(req);
    if (subject) {
      const principal: Principal = {
        aal: header(req, "x-test-aal") ?? "aal1",
        // Nested, because that is where the issuer puts it and where the staff
        // gate looks: a harness minting a flatter token than production does
        // tests a guard nobody deploys.
        claims: schemaClaims(header(req, "x-test-schema")),
        clientId: header(req, "x-test-client-id"),
        email: header(req, "x-test-email"),
        staffRole: header(req, "x-test-staff-role"),
        subject,
        type: header(req, "x-test-type") === "service" ? "service" : "user",
      };
      (req as Request & { principal?: Principal }).principal = principal;
    }
    next();
  }
}

function schemaClaims(schema: string | null): Record<string, unknown> {
  return schema ? { ext: { schema } } : {};
}

/** `Bearer test:<subject>`, and nothing else: a real token is not read here. */
function bearerSubject(req: Request): string | null {
  const value = header(req, "authorization");
  const prefix = "Bearer test:";
  return value?.startsWith(prefix) ? value.slice(prefix.length) : null;
}

function header(req: Request, name: string): string | null {
  const value = req.headers[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}
