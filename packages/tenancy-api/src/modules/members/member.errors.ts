import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

/**
 * Every `description` reaches the client, so each says what the caller can do
 * about it and stops, in the words on their screen: `group`, `subject` and
 * `PATCH` never appear in front of somebody who clicked Remove.
 */
export const MemberErrors = {
  NOT_FOUND: {
    code: "MEMBER_NOT_FOUND",
    status: 404,
    name: "Not a member",
    description: "This person holds no standing here.",
  },
  EMAIL_UNKNOWN: {
    code: "MEMBER_EMAIL_UNKNOWN",
    status: 404,
    name: "No account with that email",
    description:
      "Nobody has signed in with this address yet. They need an account before they can be given a standing.",
  },
  SELF: {
    code: "MEMBER_SELF",
    status: 409,
    name: "Your own standing",
    description:
      "You cannot change or remove your own standing. Ask an owner or a manager to do it for you.",
  },
  LAST_OWNER: {
    code: "MEMBER_LAST_OWNER",
    status: 409,
    name: "Last owner",
    description: "This is the only owner. Appoint another owner first.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
