import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

/**
 * What the kernel refuses with when the host named no mask for the partition.
 *
 * The one piece of resource vocabulary a routeless kernel keeps, and it is
 * deliberately generic: a mask that guesses names a resource the caller may not
 * be entitled to know exists, so a mask that guesses is a mask that leaks. A
 * host that wants its own 404 passes it in as `AuthorizationModule.forRoot({ masks })`.
 *
 * Named for the kernel rather than `AuthorizationErrors`, which is the
 * `PERMISSION_*` catalogue in `@aec-craft/platform-contracts`.
 */
export const AuthorizationKernelErrors = {
  NOT_FOUND: {
    code: "RESOURCE_NOT_FOUND",
    status: 404,
    name: "Not found",
    description:
      "No resource matches this reference, or it lies outside what you can see.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
