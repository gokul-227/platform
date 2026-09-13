import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

export const ProjectErrors = {
  NOT_FOUND: {
    code: "PROJECT_NOT_FOUND",
    status: 404,
    name: "Project not found",
    description: "No project matches the supplied id.",
  },
  SLUG_TAKEN: {
    code: "PROJECT_SLUG_TAKEN",
    status: 409,
    name: "Project slug taken",
    description:
      "A project with this slug already exists in the parent organization.",
  },
  LAST_OWNER: {
    code: "PROJECT_LAST_OWNER",
    status: 409,
    name: "Last owner protected",
    description: "Cannot remove the last owner of the project.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
