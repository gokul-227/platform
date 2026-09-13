import { z } from "zod";

/**
 * The identity provider's back-channel into the platform.
 *
 * A platform user row is a profile, and the identity it belongs to is the
 * provider's. Kratos fires the upsert after registration and after a settings
 * change, so the row tracks the identity without the platform ever polling.
 *
 * Deletion is not a hook: Kratos has none for it, because deleting an identity
 * is an admin API call rather than a self-service flow. The console makes that
 * call and then calls the delete route here, in that order.
 *
 * Only the fields the provider owns travel here: the identity id, the email and
 * the name. The avatar is not among them, and the reason is worth stating
 * because it is not that Kratos cannot carry one. The schema is ours and a
 * trait is two lines. It is that the mapper runs at registration only, so a
 * picture taken from a provider is frozen at first sign-in and never refreshes,
 * and nothing here wants a field that silently goes stale. Revisit when there
 * is a login hook to keep it current, or an upload that makes the platform its
 * writer.
 *
 * The test for any new field: does authentication need it? Yes means the
 * identity owns it and this webhook projects it. No means the platform owns it
 * and this webhook never mentions it.
 */
export const upsertIdentityInputSchema = z
  .object({
    externalId: z
      .string()
      .min(1)
      .describe(
        "The Kratos identity id. The same value the issuer puts in `sub`, which is what makes the profile and its standings join."
      ),
    email: z.string().email(),
    name: z.string().nullable().optional(),
  })
  .describe(
    "Idempotent. A second call for the same identity updates the profile rather than failing, because a settings change fires the same hook as a registration."
  );

export type UpsertIdentityInput = z.infer<typeof upsertIdentityInputSchema>;
