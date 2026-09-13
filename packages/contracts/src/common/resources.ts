/** Display labels for the platform's resource types. */
export const RESOURCE_LABELS = {
  org: "Organization",
  project: "Project",
  member: "Member",
  graph: "Graph",
  file: "File",
  folder: "Folder",
  thread: "Thread",
  audit: "Audit",
  user: "User",
} as const;

/** Every resource type the platform recognises. Closed union — adding a
 * row to `RESOURCE_LABELS` widens this automatically. */
export type PlatformResource = keyof typeof RESOURCE_LABELS;

/**
 * Lookup with wire-data fallback. The audit log writes `resource` as a
 * plain text column for forward-compat (a new resource can ship before
 * this file catches up), so consumers that hand us an unknown string get
 * the raw value back instead of a missing entry.
 */
export function resourceLabel(resource: string): string {
  return (RESOURCE_LABELS as Record<string, string>)[resource] ?? resource;
}
