import { platformErrorSpecSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

/**
 * Config for `AuthorizationModule.forRoot()`, zod-validated at boot. The
 * deployable owns secret loading; this package never reads `process.env`.
 */
const ConfigSchema = z.object({
  /** The platform database. This slice owns the `group` table. */
  databaseUrl: z.string().url(),
  /**
   * The not-found each `ScopeRef` variant masks as. The host owns this
   * vocabulary: every resource package depends on this one, so the kernel cannot
   * import a resource's error catalogue. A `group` ref has no entry, because
   * nothing a caller can name is a group: an unreachable `groupId` in a body
   * falls back to the generic mask.
   */
  masks: z
    .object({
      org: platformErrorSpecSchema,
      project: platformErrorSpecSchema,
    })
    .partial()
    .default({}),
  /** Keto's read port. Answers checks; called on every request. */
  ketoReadUrl: z.string().url(),
  /** Keto's write port. Whatever reaches it can grant itself anything. */
  ketoWriteUrl: z.string().url(),
  /** Mint a Google identity token per Keto URL. On where Keto is IAM-gated, off
   * locally where it is unauthenticated on loopback. */
  ketoIdentityTokens: z.boolean().default(false),
  /** How long to wait for Keto. Short: a check sits on every request, and a slow
   * refusal holds a connection the caller has already abandoned. */
  ketoTimeoutMs: z.number().int().positive().default(2000),
  /**
   * The `schema` claim a staff identity carries, as the identity provider
   * spells it. Here rather than in the guard for the same reason `masks` is:
   * this package holds no other service's vocabulary.
   */
  staffIdentitySchema: z.string().min(1).default("staff"),
  /**
   * The `staffRole` values this deployment admits. Defaulted rather than
   * required so a host that says nothing still gets the policy rather than a
   * boot failure, and so a new composition root cannot silently opt out of it.
   */
  staffRoles: z.array(z.string().min(1)).nonempty().default(["admin"]),
});

export type Config = z.infer<typeof ConfigSchema>;

/** What a host passes in: a defaulted field is optional going in and present
 * coming out. */
export type ConfigInput = z.input<typeof ConfigSchema>;

export function parseConfig(input: unknown): Config {
  return ConfigSchema.parse(input);
}

export const ConfigToken = Symbol.for(
  "@aec-craft/platform-authorization:config"
);
