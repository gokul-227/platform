import { PlatformError } from "@aec-craft/platform-contracts";
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Config } from "../../src/config/config";
import { StaffGuard } from "../../src/guards/staff.guard";

/** Just the slice of `ExecutionContext` the guard reads. */
function contextWith(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/** Only the fields the guard reads; the rest of `Config` is Keto's. */
const config = {
  staffIdentitySchema: "staff",
  staffRoles: ["admin"],
} as Config;

/** A staff admin as an authorization-code token describes them: consent emits
 *  `schema` and `staffRole` under `ext`, Hydra stamps `client_id`. */
function staffAdmin(overrides: Record<string, unknown> = {}) {
  return {
    aal: "aal2",
    claims: { ext: { schema: "staff" } },
    clientId: "buildos-id-console",
    email: "admin@example.test",
    staffRole: "admin",
    subject: "kratos-identity-id",
    type: "user",
    ...overrides,
  };
}

describe("StaffGuard", () => {
  const guard = new StaffGuard(config);

  it("admits the schema and a listed role together", () => {
    expect(guard.canActivate(contextWith({ principal: staffAdmin() }))).toBe(
      true
    );
  });

  it("reads a flat `schema` claim as well as one nested under `ext`", () => {
    expect(
      guard.canActivate(
        contextWith({ principal: staffAdmin({ claims: { schema: "staff" } }) })
      )
    ).toBe(true);
  });

  it("refuses an unauthenticated caller", () => {
    expect(() => guard.canActivate(contextWith({}))).toThrow(PlatformError);
  });
});

describe("StaffGuard, neither half is enough on its own", () => {
  const guard = new StaffGuard(config);

  it("refuses the schema without a role, which is most staff", () => {
    // Everybody at one of our own domains is put on this schema automatically
    // and internal documentation admits them. This surface does not.
    expect(() =>
      guard.canActivate(
        contextWith({ principal: staffAdmin({ staffRole: null }) })
      )
    ).toThrow(PlatformError);
  });

  it("refuses a role without the schema, so a leftover value grants nothing", () => {
    expect(() =>
      guard.canActivate(
        contextWith({
          principal: staffAdmin({ claims: { ext: { schema: "default" } } }),
        })
      )
    ).toThrow(PlatformError);
  });

  it("refuses a role this deployment does not list, `superadmin` included", () => {
    for (const staffRole of ["auditor", "superadmin", ""]) {
      expect(() =>
        guard.canActivate(contextWith({ principal: staffAdmin({ staffRole }) }))
      ).toThrow(PlatformError);
    }
  });

  it("refuses a token that carries a role and nothing else", () => {
    // The bypass this replaced: any `staffRole` admitted before the assurance
    // floor, the schema and the `user` check had been reached at all.
    expect(() =>
      guard.canActivate(contextWith({ principal: { staffRole: "admin" } }))
    ).toThrow(PlatformError);
  });
});

describe("StaffGuard, tokens with nobody behind them", () => {
  const guard = new StaffGuard(config);

  it("refuses a first-factor session on either path", () => {
    expect(() =>
      guard.canActivate(contextWith({ principal: staffAdmin({ aal: "aal1" }) }))
    ).toThrow(PlatformError);
  });

  it("refuses a client-credentials token, which has no person behind it", () => {
    expect(() =>
      guard.canActivate(
        contextWith({
          principal: staffAdmin({
            subject: "buildos-id-console",
            type: "service",
          }),
        })
      )
    ).toThrow(PlatformError);
  });

  it("refuses a token stating no schema at all", () => {
    expect(() =>
      guard.canActivate(contextWith({ principal: staffAdmin({ claims: {} }) }))
    ).toThrow(PlatformError);
  });
});
