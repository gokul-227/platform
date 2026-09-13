/**
 * Adds the RFC 9728 `WWW-Authenticate: Bearer resource_metadata="..."` challenge
 * to 401 responses, then hands off to the platform envelope.
 *
 * Without it an MCP client gets a bare 401 and gives up; with it the client
 * follows the resource-metadata URL, then the authorization-server discovery
 * URL, and runs PKCE. It is what makes an unauthenticated `POST /mcp` the start
 * of a sign-in rather than a dead end.
 *
 * Extends the platform filter rather than registering beside it: two global
 * filters both matching `HttpException` would resolve by registration order,
 * which is not a property worth depending on for whether authentication can be
 * discovered.
 *
 * The challenge goes on every 401, not only the MCP path. This service is one
 * resource server with one audience, so the answer to "where do I get a token
 * for this" is the same whichever route was refused.
 */

import { PlatformExceptionFilter } from "@aec-craft/platform-common/nest";
import { PlatformError } from "@aec-craft/platform-contracts";
import {
  type ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class WwwAuthenticateFilter extends PlatformExceptionFilter {
  private readonly resourceMetadataUrl: string;

  constructor(publicUrl: string) {
    super();
    this.resourceMetadataUrl = `${publicUrl}/.well-known/oauth-protected-resource`;
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (isUnauthorized(exception)) {
      host
        .switchToHttp()
        .getResponse<Response>()
        .setHeader(
          "WWW-Authenticate",
          `Bearer resource_metadata="${this.resourceMetadataUrl}"`
        );
    }
    super.catch(exception, host);
  }
}

function isUnauthorized(exception: unknown): boolean {
  if (exception instanceof UnauthorizedException) {
    return true;
  }
  if (exception instanceof PlatformError) {
    return exception.statusCode === Number(HttpStatus.UNAUTHORIZED);
  }
  if (exception instanceof HttpException) {
    return exception.getStatus() === Number(HttpStatus.UNAUTHORIZED);
  }
  return false;
}
