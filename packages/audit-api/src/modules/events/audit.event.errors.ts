import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

export const AuditEventErrors = {
  NOT_FOUND: {
    code: "AUDIT_EVENT_NOT_FOUND",
    status: 404,
    name: "Audit event not found",
    description:
      "No audit-log event matches the supplied id, or it lives outside your scope.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
