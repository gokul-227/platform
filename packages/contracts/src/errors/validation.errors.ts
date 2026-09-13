import type { PlatformErrorSpec } from "./platform.error";

/** Input validation failures. */
export const ValidationErrors = {
  FAILED: {
    code: "VALIDATION_FAILED",
    status: 400,
    name: "Validation failed",
    description: "Request input failed schema validation.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
