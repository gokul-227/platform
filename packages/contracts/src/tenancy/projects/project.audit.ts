/**
 * Project-module audit actions. Same `resource → verb[]` shape as
 * `org.audit.ts`; see that file for the type-safe pairing pattern.
 */
export const PROJECT_AUDIT_ACTIONS = {
  project: ["created", "updated", "deleted"],
} as const;

export type ProjectAuditResource = keyof typeof PROJECT_AUDIT_ACTIONS;

/** Ordered list of project-scoped audit resources. See `org.audit.ts`. */
export const PROJECT_AUDIT_RESOURCES: readonly ProjectAuditResource[] =
  Object.keys(PROJECT_AUDIT_ACTIONS) as ProjectAuditResource[];

/** Display labels. See `org.audit.ts` for the per-action override rationale. */
export const PROJECT_AUDIT_ACTION_LABELS = {
  "project.created": "Project created",
  "project.updated": "Project updated",
  "project.deleted": "Project deleted",
} as const;
