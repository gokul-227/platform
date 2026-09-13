import {
  createMemberInputSchema,
  memberListQuerySchema,
  updateMemberInputSchema,
} from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";

import { assertNotSelfStanding } from "../../src/modules/members/member.assertions";
import { MemberErrors } from "../../src/modules/members/member.errors";

const principal = { subject: "kratos-1" } as never;

/**
 * The two rules a request can break before anything is read: naming yourself,
 * and naming a person two ways at once. Everything else about a standing needs
 * the tuple store and is asserted in the integration suite.
 */
describe("adding and changing a member", () => {
  it("refuses a caller acting on their own standing", () => {
    expect(() => assertNotSelfStanding(principal, "kratos-1")).toThrowError(
      expect.objectContaining({ code: MemberErrors.SELF.code })
    );
  });

  it("allows acting on anybody else", () => {
    expect(() => assertNotSelfStanding(principal, "kratos-2")).not.toThrow();
  });

  it("takes an email or a subject, and refuses both or neither", () => {
    expect(
      createMemberInputSchema.safeParse({
        email: "ada@example.test",
        standing: "editor",
      }).success
    ).toBe(true);
    expect(
      createMemberInputSchema.safeParse({
        subject: "client-1",
        standing: "editor",
      }).success
    ).toBe(true);
    expect(
      createMemberInputSchema.safeParse({
        email: "ada@example.test",
        subject: "client-1",
        standing: "editor",
      }).success
    ).toBe(false);
    expect(
      createMemberInputSchema.safeParse({ standing: "editor" }).success
    ).toBe(false);
  });

  it("refuses a standing outside the five", () => {
    expect(
      updateMemberInputSchema.safeParse({ standing: "superuser" }).success
    ).toBe(false);
    expect(
      updateMemberInputSchema.safeParse({ standing: "owner" }).success
    ).toBe(true);
  });

  it("bounds the page: the list is one Keto call, not a keyset", () => {
    expect(memberListQuerySchema.safeParse({ pageSize: 200 }).success).toBe(
      true
    );
    expect(memberListQuerySchema.safeParse({ pageSize: 201 }).success).toBe(
      false
    );
    expect(memberListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});
