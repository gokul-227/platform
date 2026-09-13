import type { FieldRule } from "@aec-craft/platform-cbm-engine";

import { COMMON_PROPERTY_RULES } from "./common";
import { PROGRAMME_PROPERTY_RULES } from "./programme";
import { QUANTITY_RULES } from "./quantities";
import { VENDOR_PROPERTY_RULES } from "./vendor";

export { COMMON_PROPERTY_RULES } from "./common";
export { PROGRAMME_PROPERTY_RULES } from "./programme";
export { QUANTITY_RULES } from "./quantities";
export { VENDOR_PROPERTY_RULES } from "./vendor";

/**
 * The property layer, in application order.
 *
 * Vendor first so the standard rules that follow overwrite them wherever a
 * file carries both. A file with proper base quantities is never degraded by
 * also carrying an authoring tool's own sets.
 */
export const PROPERTY_RULES: FieldRule[] = [
  ...VENDOR_PROPERTY_RULES,
  ...COMMON_PROPERTY_RULES,
  ...PROGRAMME_PROPERTY_RULES,
  ...QUANTITY_RULES,
];
