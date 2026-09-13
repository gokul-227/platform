// `@aec-craft/platform-common` core export — framework-neutral toolkit shared by the
// platform's API packages. NestJS bindings live at `@aec-craft/platform-common/nest`.

export { isUniqueViolation } from "./db";
export {
  type ResolvedScope,
  rowInScope,
  type ScopedRow,
  scopeFromRow,
} from "./scope";
export { makeSlug, SLUG_RE, uniqueSlug } from "./slug";
