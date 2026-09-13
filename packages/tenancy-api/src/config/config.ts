import { z } from "zod";

/**
 * Config for `TenancyApiModule.forRoot()`, zod-validated at boot. The
 * deployable owns secret loading; this package never reads `process.env`.
 */
const ConfigSchema = z.object({
  /**
   * This slice owns `org` and `project` and writes the `group` table the
   * authorization package reads, so all three share one connection and one
   * transaction.
   */
  databaseUrl: z.string().url(),
});

/** The parsed config, every default resolved. */
export type Config = z.infer<typeof ConfigSchema>;
/** What a host passes to `forRoot()`: defaults may be omitted. */
export type ConfigInput = z.input<typeof ConfigSchema>;

export function parseConfig(input: unknown): Config {
  return ConfigSchema.parse(input);
}

export const ConfigToken = Symbol.for("@aec-craft/platform-tenancy-api:config");
