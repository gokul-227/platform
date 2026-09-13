/**
 * The property bag both nodes and edges carry, and the two read-side shapes
 * over it: the derived key list, and the response projection.
 *
 * Top-level keys are capability blocks, declared per node type (see the type
 * folders). The bag itself stays open at this layer: a tool that does not know
 * a block ignores it.
 */

import { z } from "zod";

export const propertiesSchema = z
  .record(z.string(), z.unknown())
  .describe(
    "Open-ended property bag. Top-level keys are capability blocks: " +
      "`envelope`, `programme`, `material`, `finishes`, `systems`, `geometry`, `interop`. " +
      "Project-specific blocks are allowed; tools that do not know an unknown block ignore it. " +
      "On reads you may project to a subset of top-level keys to keep the payload small."
  );

export const propertyKeysSchema = z
  .array(z.string())
  .describe(
    "Top-level keys present in `properties`. Server-derived; read-only. Use for cheap key-existence checks without fetching values."
  );

/**
 * Accepts either an array (`?select=a&select=b`) or a single string
 * (`?select=a`); Express delivers a string in the singular case. SDK
 * callers passing a typed `string[]` go through the array branch.
 *
 * Named `select` (PostgREST's projection parameter) so the wire stays
 * consistent with the framework's `op.value` filter grammar. `?properties=`
 * is reserved for the JSONB filter on the `properties` column.
 */
export const selectProjectionSchema = z
  .union([
    z.array(z.string().min(1)),
    z
      .string()
      .min(1)
      .transform((s) => [s]),
  ])
  .describe(
    "Top-level `properties` keys to include in the response. Missing keys come back as `null`. Omit (or pass an empty array) to receive every property."
  );
