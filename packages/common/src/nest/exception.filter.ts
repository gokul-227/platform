import { STATUS_CODES } from "node:http";
import type { PlatformErrorBody } from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  PlatformError,
  toErrorBody,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import {
  BadRequestException,
  Catch,
  ForbiddenException,
  HttpException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { Response } from "express";

/**
 * Maps any thrown value to a stable HTTP envelope.
 *
 *   PlatformError         → use its code + statusCode verbatim
 *   BadRequestException   → VALIDATION_FAILED (ValidationPipe failures)
 *   UnauthorizedException → ACCESS_PRINCIPAL_REQUIRED (the principal guard refusing)
 *   ForbiddenException    → PERMISSION_FORBIDDEN (a standing the caller lacks)
 *   other HttpException   → preserve Nest's status, code derived from the
 *                           status text (`HTTP_NOT_FOUND`, `HTTP_FORBIDDEN`, …)
 *   anything else         → 500 INTERNAL_UNEXPECTED, message scrubbed
 *
 * Domain errors are always thrown as `PlatformError`. The `HTTP_*` codes
 * surface transport-layer failures (missing route, framework guard reject,
 * etc.) distinctly so callers don't confuse them with domain failures.
 *
 * `Unauthorized` / `Forbidden` are mapped specifically so the wire codes
 * match what's documented on every route — the auth middleware throws Nest's
 * built-in exceptions, but clients see the same `ACCESS_*` codes they see
 * from domain-level guards.
 */
@Catch()
export class PlatformExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PlatformExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof PlatformError) {
      res.status(exception.statusCode).json(toErrorBody(exception));
      return;
    }

    if (exception instanceof BadRequestException) {
      const response = exception.getResponse();
      const body: PlatformErrorBody = {
        error: {
          code: ValidationErrors.FAILED.code,
          message: exception.message,
          description: ValidationErrors.FAILED.description,
          ...(typeof response === "object" && response !== null
            ? { details: response }
            : {}),
        },
      };
      res.status(exception.getStatus()).json(body);
      return;
    }

    if (exception instanceof UnauthorizedException) {
      res.status(AuthenticationErrors.PRINCIPAL_REQUIRED.status).json({
        error: {
          code: AuthenticationErrors.PRINCIPAL_REQUIRED.code,
          message:
            exception.message || AuthenticationErrors.PRINCIPAL_REQUIRED.name,
          description: AuthenticationErrors.PRINCIPAL_REQUIRED.description,
        },
      } satisfies PlatformErrorBody);
      return;
    }

    if (exception instanceof ForbiddenException) {
      res.status(AuthorizationErrors.FORBIDDEN.status).json({
        error: {
          code: AuthorizationErrors.FORBIDDEN.code,
          message: exception.message || AuthorizationErrors.FORBIDDEN.name,
          description: AuthorizationErrors.FORBIDDEN.description,
        },
      } satisfies PlatformErrorBody);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const statusText = STATUS_CODES[status] ?? "HTTP error";
      const code = `HTTP_${statusText.toUpperCase().replace(/\s+/g, "_")}`;
      const body: PlatformErrorBody = {
        error: {
          code,
          message: exception.message,
          description: statusText,
        },
      };
      res.status(status).json(body);
      return;
    }

    // TODO: malformed UUID path params surface here as PG 22P02 -> 500; add
    // route-param validation so they 400 before the DB and this branch stays for
    // truly unexpected failures.
    this.logger.error(
      "Unhandled exception",
      exception instanceof Error ? exception.stack : String(exception)
    );
    res.status(InternalErrors.UNEXPECTED.status).json({
      error: {
        code: InternalErrors.UNEXPECTED.code,
        message: InternalErrors.UNEXPECTED.name,
        description: InternalErrors.UNEXPECTED.description,
      },
    } satisfies PlatformErrorBody);
  }
}
