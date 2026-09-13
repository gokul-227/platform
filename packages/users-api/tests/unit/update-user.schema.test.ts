import { updateUserInputSchema } from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";

const AVATAR = "https://cdn.test/a.png";

describe("updateUserInputSchema", () => {
  // Regression: the self-update schema MUST strip `role` so a regular user
  // can't self-promote via `PATCH /me`. If a future change flips the schema
  // to `.passthrough()` (e.g. to allow arbitrary extras), this test fails
  // and forces the contributor to add an explicit guard instead.
  it("silently strips `role` to prevent self-promotion", () => {
    const parsed = updateUserInputSchema.parse({
      picture: AVATAR,
      role: "admin",
    });
    expect(parsed).toEqual({ picture: AVATAR });
    expect((parsed as { role?: unknown }).role).toBeUndefined();
  });

  it("silently strips any unknown field", () => {
    const parsed = updateUserInputSchema.parse({
      picture: AVATAR,
      isSecretlyPrivileged: true,
      __proto__: { admin: true },
    });
    expect(parsed).toEqual({ picture: AVATAR });
  });

  // The identity provider's webhook is the only writer of `name` and `email`.
  // Accepting either here would make the platform a second writer, and the
  // next hook fire would revert whatever this endpoint stored.
  it("strips the identity traits it does not own", () => {
    const parsed = updateUserInputSchema.parse({
      picture: AVATAR,
      name: "Renamed",
      email: "other@test.example",
    });
    expect(parsed).toEqual({ picture: AVATAR });
  });
});
