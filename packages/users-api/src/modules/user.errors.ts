import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

export const UserErrors = {
  NOT_FOUND: {
    code: "USER_NOT_FOUND",
    status: 404,
    name: "User not found",
    description: "No user matches the supplied id.",
  },
  DELETE_BLOCKED_LAST_OWNER: {
    code: "USER_DELETE_BLOCKED_LAST_OWNER",
    status: 409,
    name: "Account deletion blocked",
    description:
      "You are the last owner of one or more organizations or projects. Transfer ownership before deleting your account. The blocking resources are listed in `details`.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
