import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

export const OrgErrors = {
  NOT_FOUND: {
    code: "ORG_NOT_FOUND",
    status: 404,
    name: "Organization not found",
    description: "No organization matches the supplied id or slug.",
  },
  SLUG_TAKEN: {
    code: "ORG_SLUG_TAKEN",
    status: 409,
    name: "Organization slug taken",
    description: "An organization with this slug already exists.",
  },
  LAST_OWNER: {
    code: "ORG_LAST_OWNER",
    status: 409,
    name: "Last owner protected",
    description: "Cannot remove or demote the last owner of the organization.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
