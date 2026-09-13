/**
 * Platform error infrastructure: `PlatformError` class, the spec shape every
 * catalog satisfies, and the wire envelope returned to clients.
 *
 * Cross-cutting catalogs (`AuthenticationErrors`, `InternalErrors`, `AuthorizationErrors`,
 * `ValidationErrors`) live as siblings — see `./access.errors.ts` etc. A catalog
 * with a single owner lives with that owner: `GraphNodeErrors` in graph-api,
 * `FileErrors` in files-api.
 *
 * Throw sites pass a spec object directly:
 *
 *   throw new PlatformError(AuthenticationErrors.PRINCIPAL_REQUIRED);
 *   throw new PlatformError(UserErrors.NOT_FOUND, `User '${id}' not found`);
 *   throw new PlatformError(ValidationErrors.FAILED, message, { details });
 */

import { z } from "zod";

export interface PlatformErrorSpec {
  /** Stable wire identifier. e.g. "ORG_NOT_FOUND". Append-only contract. */
  code: string;
  /** Longer explanation. Surfaced in the wire envelope. */
  description: string;
  /** Short human-readable title; used as the default message. */
  name: string;
  /** HTTP status mapped to this error by the exception filter. */
  status: number;
}

/**
 * `PlatformErrorSpec` as zod, for the hosts that accept one as input.
 *
 * Beside the interface rather than at the caller: a validator kept in another
 * package stops matching the moment a field is added here, and nothing fails
 * to say so.
 */
export const platformErrorSpecSchema = z.object({
  code: z.string().min(1),
  description: z.string(),
  name: z.string(),
  status: z.number().int(),
});

export interface PlatformErrorOptions {
  /** Original error preserved for logging. Not surfaced to clients. */
  cause?: unknown;
  /** Free-form details surfaced to the client. Avoid leaking internals. */
  details?: unknown;
  /** Override the spec's default HTTP status. */
  statusCode?: number;
}

export class PlatformError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly description: string;
  readonly details: unknown;
  override readonly cause: unknown;

  constructor(
    spec: PlatformErrorSpec,
    message?: string,
    options?: PlatformErrorOptions
  ) {
    super(message ?? spec.name);
    this.name = "PlatformError";
    this.code = spec.code;
    this.statusCode = options?.statusCode ?? spec.status;
    this.description = spec.description;
    this.details = options?.details;
    this.cause = options?.cause;
  }
}

/**
 * Stable wire envelope returned to clients on any `PlatformError`.
 *
 * Single source of truth for both the runtime envelope shape and the OpenAPI
 * `PlatformErrorBody` component used by every documented error response.
 */
export const platformErrorBodySchema = z
  .object({
    error: z
      .object({
        code: z
          .string()
          .describe(
            "Stable identifier you can match on to handle errors programmatically (for example, `USER_NOT_FOUND`)."
          ),
        message: z
          .string()
          .describe(
            "Short human-readable message. May change between releases — don't match on this."
          ),
        description: z
          .string()
          .describe(
            "Longer explanation of what went wrong, suitable for showing to a user."
          ),
        details: z
          .unknown()
          .optional()
          .describe(
            "Extra context that varies by error code. Only present when the specific error documents a payload here."
          ),
      })
      .describe("Always populated on a failure response."),
  })
  .describe("The standard envelope returned with every error response.");

export type PlatformErrorBody = z.infer<typeof platformErrorBodySchema>;

export const toErrorBody = (err: PlatformError): PlatformErrorBody => ({
  error: {
    code: err.code,
    message: err.message,
    description: err.description,
    ...(err.details !== undefined && { details: err.details }),
  },
});
