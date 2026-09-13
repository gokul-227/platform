import { z } from "zod";

/**
 * Config for `ThreadsApiModule.forRoot()`, zod-validated at boot. The deployable
 * owns secret loading; this package never reads `process.env`.
 */
const ConfigSchema = z.object({
  /** Threads, runs and the LangGraph checkpoints. */
  databaseUrl: z.string().url(),
  /**
   * Unset: the worker stays dormant and runs sit `queued`, which a client may
   * still finalize. The tier-to-model map is policy inside the executor;
   * `region` is the one deployment knob (Vertex location, data residency).
   */
  llm: z
    .object({
      region: z.string().min(1).default("global"),
    })
    .optional(),
  /**
   * Persists each run's query trace to `thread_run.debug`. A local debug
   * surface, never user-facing; off in production.
   */
  runDebug: z.boolean().optional(),
});

/** The parsed config, every default resolved. */
export type Config = z.infer<typeof ConfigSchema>;
/** What a host passes to `forRoot()`: defaults may be omitted. */
export type ConfigInput = z.input<typeof ConfigSchema>;

export function parseConfig(input: unknown): Config {
  return ConfigSchema.parse(input);
}

export const ConfigToken = Symbol.for("@aec-craft/platform-threads-api:config");
