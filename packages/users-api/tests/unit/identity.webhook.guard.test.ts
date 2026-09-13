import {
  AuthenticationErrors,
  PlatformError,
} from "@aec-craft/platform-contracts";
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Config } from "../../src/config/config";
import { parseConfig } from "../../src/config/config";
import { IdentityWebhookGuard } from "../../src/modules/webhooks/identity/identity.webhook.guard";

const SECRET = "a-shared-secret-long-enough";

/** Just the slice of `ExecutionContext` a header guard reads. */
function contextWith(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardWith(secret?: string): IdentityWebhookGuard {
  return new IdentityWebhookGuard({
    databaseUrl: "postgres://localhost/platform",
    ...(secret === undefined ? {} : { identityWebhookSecret: secret }),
  } as Config);
}

describe("IdentityWebhookGuard", () => {
  it("admits the bearer that matches the configured secret", () => {
    const guard = guardWith(SECRET);
    expect(
      guard.canActivate(
        contextWith({ headers: { authorization: `Bearer ${SECRET}` } })
      )
    ).toBe(true);
  });

  it("refuses a wrong secret, a prefix of it, and one with trailing whitespace", () => {
    const guard = guardWith(SECRET);
    for (const presented of [
      "wrong",
      SECRET.slice(0, -1),
      `${SECRET} `,
      `${SECRET}\n`,
    ]) {
      expect(() =>
        guard.canActivate(
          contextWith({ headers: { authorization: `Bearer ${presented}` } })
        )
      ).toThrow(PlatformError);
    }
  });

  it("refuses a missing header, a bare token and the wrong scheme", () => {
    const guard = guardWith(SECRET);
    for (const headers of [
      {},
      { authorization: SECRET },
      { authorization: `Basic ${SECRET}` },
      { authorization: "Bearer " },
      { authorization: `bearer ${SECRET}` },
    ]) {
      expect(() => guard.canActivate(contextWith({ headers }))).toThrow(
        PlatformError
      );
    }
  });

  it("fails closed when no secret is configured, even with no header sent", () => {
    const guard = guardWith();
    expect(() =>
      guard.canActivate(contextWith({ headers: { authorization: "Bearer " } }))
    ).toThrow(PlatformError);
    expect(() => guard.canActivate(contextWith({ headers: {} }))).toThrow(
      PlatformError
    );
  });

  it("says the same thing whether the secret is wrong or absent", () => {
    const codeFor = (secret?: string): string => {
      try {
        guardWith(secret).canActivate(
          contextWith({ headers: { authorization: "Bearer nope-nope-nope" } })
        );
      } catch (error) {
        return (error as PlatformError).code;
      }
      return "admitted";
    };
    expect(codeFor(SECRET)).toBe(AuthenticationErrors.PRINCIPAL_REQUIRED.code);
    expect(codeFor()).toBe(AuthenticationErrors.PRINCIPAL_REQUIRED.code);
  });
});

describe("the webhook secret in config", () => {
  it("trims the newline a shell-populated secret carries", () => {
    expect(
      parseConfig({
        databaseUrl: "postgres://localhost/platform",
        identityWebhookSecret: `${SECRET}\n`,
      }).identityWebhookSecret
    ).toBe(SECRET);
  });

  it("refuses a secret too short to be one", () => {
    expect(() =>
      parseConfig({
        databaseUrl: "postgres://localhost/platform",
        identityWebhookSecret: "short",
      })
    ).toThrow();
  });
});
