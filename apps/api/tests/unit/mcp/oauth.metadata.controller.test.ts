import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OAuthMetadataController } from "../../../src/oauth.metadata.controller";

describe("OAuthMetadataController", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.PUBLIC_URL = "http://localhost:3200";
    process.env.OIDC_ISSUER = "http://localhost:4444";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns RFC 9728 protected-resource metadata pointing at the auth server", () => {
    const controller = new OAuthMetadataController();
    const meta = controller.metadata();
    expect(meta.resource).toBe("http://localhost:3200");
    expect(meta.authorization_servers).toEqual(["http://localhost:4444"]);
    expect(meta.bearer_methods_supported).toEqual(["header"]);
    expect(meta.scopes_supported).toContain("openid");
  });

  // Claude Code requests only this form and does not fall back to the root
  // document, so a divergence here breaks discovery silently.
  it("serves the same document at the RFC 9728 §3.1 path-suffixed location", () => {
    const controller = new OAuthMetadataController();
    expect(controller.metadataForMcpPath()).toEqual(controller.metadata());
  });

  // `resource` is the audience PrincipalGuard enforces. Publishing a different
  // one sends clients to request a token this API then refuses.
  it("publishes PUBLIC_URL as the resource identifier", () => {
    process.env.PUBLIC_URL = "https://api.dev.platform.os.build";
    expect(new OAuthMetadataController().metadata().resource).toBe(
      "https://api.dev.platform.os.build"
    );
  });

  it("throws clearly when the issuer is not configured", () => {
    delete process.env.OIDC_ISSUER;
    expect(() => new OAuthMetadataController()).toThrow(/OIDC_ISSUER/);
  });

  it("throws clearly when the resource identifier is not configured", () => {
    delete process.env.PUBLIC_URL;
    expect(() => new OAuthMetadataController()).toThrow(/PUBLIC_URL/);
  });
});
