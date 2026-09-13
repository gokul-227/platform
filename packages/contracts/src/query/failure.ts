import { PlatformError, ValidationErrors } from "../errors";

/**
 * How this package refuses.
 *
 * Every rejection here is the caller's query being wrong — an operator the field
 * does not allow, a value that will not coerce, a sort beside a cursor — so they
 * are all `VALIDATION_FAILED` with a message naming what was wrong. One helper
 * rather than the constructor inline, so the package cannot start answering 500
 * to a bad query string.
 *
 * Nothing here knows a table or a domain. A path this package cannot resolve is
 * refused, not guessed at.
 */
export function failed(message: string): PlatformError {
  return new PlatformError(ValidationErrors.FAILED, message);
}
