import type { PlatformErrorSpec } from "./platform.error";

/**
 * Who is calling. Every code here is a 401: the caller is not established.
 *
 * Authentication happens at the edge — an API verifies one signature and gets a
 * caller or a bare 401 — so nothing here describes a bad token. What is left is
 * the seam between a verified caller and the platform's own record of them.
 *
 * What that caller may then do is `AuthorizationErrors`. The two were one
 * catalogue called `AuthenticationErrors`, which is why the wire codes still read
 * `ACCESS_*`; the name was vague because the contents were mixed.
 *
 * A `description` reaches the client, so it says what the caller can do and
 * nothing about how the platform is built. Which component grants a role, what
 * populates a profile and why a check failed closed are all things a reader can
 * only act on if they already have access, and things an attacker would
 * otherwise be handed for free. The reasoning lives in the endpoint's own
 * documentation, which someone reads by choosing to.
 */
export const AuthenticationErrors = {
  PRINCIPAL_REQUIRED: {
    code: "ACCESS_PRINCIPAL_REQUIRED",
    status: 401,
    name: "Sign-in required",
    description: "This operation requires a signed-in caller.",
  },
  PRINCIPAL_NOT_PROVISIONED: {
    code: "ACCESS_PRINCIPAL_NOT_PROVISIONED",
    status: 401,
    name: "Account not ready",
    description:
      "Your account is not set up on this platform yet. Sign out and back in; if it persists, contact support.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
