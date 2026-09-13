import type { PlatformErrorSpec } from "./platform.error";

/**
 * Catch-all platform faults.
 *
 * The description is for whoever hit it, who cannot read a log and did nothing
 * wrong. What actually happened is in the server's log against the same code,
 * which is where someone who can act on it will look.
 */
export const InternalErrors = {
  UNEXPECTED: {
    code: "INTERNAL_UNEXPECTED",
    status: 500,
    name: "Something went wrong",
    description:
      "This is a fault on our side, not a problem with the request. Retry, and report it with this code if it persists.",
  },
  NOT_IMPLEMENTED: {
    code: "INTERNAL_NOT_IMPLEMENTED",
    status: 501,
    name: "Not implemented",
    description: "This endpoint is not available yet.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
