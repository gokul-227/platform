/**
 * RFC 9728 (OAuth 2.0 Protected Resource Metadata) discovery.
 *
 * MCP clients discover the authorization server by fetching this document from
 * the resource server. The standard flow:
 *   1. Client posts to /mcp without a token, gets 401 with
 *      `WWW-Authenticate: Bearer resource_metadata="<this-url>"`.
 *   2. Client fetches this document.
 *   3. Client fetches `<authorization_server>/.well-known/oauth-authorization-server`.
 *   4. Client runs PKCE against the authorization server.
 *   5. Client retries the original request with the obtained Bearer.
 *
 * `resource` is `PUBLIC_URL`, the same value `PlatformIdModule` requires as the
 * audience. One variable serves both, so the identifier this document publishes
 * and the audience the guard enforces cannot drift — which they could while the
 * MCP endpoint was a separate service with an `MCP_RESOURCE_URL` of its own.
 *
 * Public (no bearer) because it is the bootstrap.
 */

import { Public } from "@aec-craft/platform-id-resource-nestjs";
import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { requireEnv } from "./env";

interface OAuthProtectedResourceMetadata {
  readonly authorization_servers: readonly string[];
  readonly bearer_methods_supported: readonly string[];
  readonly resource: string;
  readonly scopes_supported: readonly string[];
}

@ApiExcludeController()
@Controller(".well-known")
export class OAuthMetadataController {
  private readonly cached: OAuthProtectedResourceMetadata;

  constructor() {
    this.cached = {
      resource: requireEnv("PUBLIC_URL"),
      authorization_servers: [requireEnv("OIDC_ISSUER")],
      // `header` only; Bearer in query or body is refused per the OAuth 2.0 BCP.
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
    };
  }

  @Public()
  @Get("oauth-protected-resource")
  metadata(): OAuthProtectedResourceMetadata {
    return this.cached;
  }

  // RFC 9728 §3.1 path-suffixed discovery: a client connecting to the resource
  // at `<host>/mcp` requests its metadata at
  // `/.well-known/oauth-protected-resource/mcp`. Current MCP clients (Claude
  // Code) REQUIRE this form and do NOT fall back to the root document, so
  // without it discovery loops on 404 and a token is never sent. Same document:
  // `resource` stays the origin, matching the audience the guard accepts.
  @Public()
  @Get("oauth-protected-resource/mcp")
  metadataForMcpPath(): OAuthProtectedResourceMetadata {
    return this.cached;
  }
}
