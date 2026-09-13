/**
 * Query keys for the staff surface, rooted separately from `platformKeys` so a
 * console can clear one without touching the other: signing a staff member out
 * of the console must not drop the product cache, and the two answer different
 * questions about the same rows.
 */
export const adminKeys = {
  all: ["admin"] as const,

  orgs: {
    all: () => [...adminKeys.all, "orgs"] as const,
    list: () => [...adminKeys.orgs.all(), "list"] as const,
    detail: (orgId: string) => [...adminKeys.orgs.all(), orgId] as const,
  },

  members: {
    all: () => [...adminKeys.all, "members"] as const,
    list: (orgId: string) => [...adminKeys.members.all(), orgId] as const,
  },

  projects: {
    all: () => [...adminKeys.all, "projects"] as const,
    list: () => [...adminKeys.projects.all(), "list"] as const,
    byOrg: (orgId: string) =>
      [...adminKeys.projects.all(), "by-org", orgId] as const,
    detail: (projectId: string) =>
      [...adminKeys.projects.all(), projectId] as const,
  },

  users: {
    all: () => [...adminKeys.all, "users"] as const,
    list: () => [...adminKeys.users.all(), "list"] as const,
    detail: (userId: string) => [...adminKeys.users.all(), userId] as const,
  },
} as const;
