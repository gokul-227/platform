import type { z } from "zod";

/**
 * A capability block: one top-level key of a node's `properties` bag, its
 * description (surfaced in the SDK vocabulary), and its Zod schema. The key is
 * captured as a literal so the canonical key union derives from the registry.
 */
export interface BlockDefinition<
  K extends string = string,
  S extends z.ZodTypeAny = z.ZodTypeAny,
> {
  description: string;
  key: K;
  schema: S;
}

export function defineBlock<K extends string, S extends z.ZodTypeAny>(
  definition: BlockDefinition<K, S>
): BlockDefinition<K, S> {
  return definition;
}
