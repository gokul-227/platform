import type { PlatformErrorSpec } from "./platform.error";

/**
 * Failures of the authorization decision itself, as opposed to the group being
 * wrong. Kept apart because these two are read by different people: a `GROUP_*`
 * code goes in front of a user, and these go in front of whoever operates the
 * thing.
 */
export const AuthorizationErrors = {
  FORBIDDEN: {
    code: "PERMISSION_FORBIDDEN",
    status: 403,
    name: "Not allowed",
    description: "You do not have access to do this here.",
  },
  ESCALATION_REFUSED: {
    code: "PERMISSION_ESCALATION_REFUSED",
    status: 403,
    name: "Standing too high to grant",
    description:
      "You can only grant a standing below your own. Ask an owner for anything higher.",
  },
  UNAVAILABLE: {
    code: "PERMISSION_UNAVAILABLE",
    status: 503,
    name: "Authorization unavailable",
    description: "Access could not be checked right now. Retry shortly.",
  },
  STAFF_REQUIRED: {
    code: "ACCESS_STAFF_REQUIRED",
    status: 403,
    name: "Staff access required",
    description:
      "This operation is restricted to staff. If you need it, ask someone who has it.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
