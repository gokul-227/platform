import { z } from "zod";

/**
 * Config for `UsersApiModule.forRoot()`, zod-validated at boot. The deployable
 * owns secret loading; this package never reads `process.env`.
 */
const ConfigSchema = z.object({
  /**
   * The platform database. This slice owns the `user` table, which every other
   * slice reads to put a name to a subject.
   */
  databaseUrl: z.string().url(),
  /**
   * Shared secret for `POST /webhooks/identity`; unset rejects every call with
   * 401. Trimmed because a Secret Manager value populated via `echo` carries a
   * trailing newline and would never compare equal.
   */
  identityWebhookSecret: z.string().trim().min(16).optional(),
});

/** The parsed config, every default resolved. */
export type Config = z.infer<typeof ConfigSchema>;
/** What a host passes to `forRoot()`: defaults may be omitted. */
export type ConfigInput = z.input<typeof ConfigSchema>;

export function parseConfig(input: unknown): Config {
  return ConfigSchema.parse(input);
}

export const ConfigToken = Symbol.for("@aec-craft/platform-users-api:config");
