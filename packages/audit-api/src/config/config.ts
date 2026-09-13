import { z } from "zod";

/**
 * Config for `AuditApiModule.forRoot()`, zod-validated at boot. The deployable
 * owns secret loading; this package never reads `process.env`.
 */
const ConfigSchema = z.object({
  databaseUrl: z.string().url(),
});

/** The parsed config, every default resolved. */
export type Config = z.infer<typeof ConfigSchema>;
/** What a host passes to `forRoot()`: defaults may be omitted. */
export type ConfigInput = z.input<typeof ConfigSchema>;

export function parseConfig(input: unknown): Config {
  return ConfigSchema.parse(input);
}

export const ConfigToken = Symbol.for("@aec-craft/platform-audit-api:config");
