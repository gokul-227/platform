import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  PlatformError,
  ValidationErrors,
} from "@aec-craft/platform-contracts";

/**
 * A stand-in spec. The filter is what is under test, and reaching for a real
 * domain catalogue would put `packages/common` on a package that depends on it.
 */
const SAMPLE: PlatformErrorSpec = {
  code: "SAMPLE_NOT_FOUND",
  status: 404,
  name: "Sample not found",
  description: "No sample matches the supplied id.",
};

import type { ArgumentsHost } from "@nestjs/common";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PlatformExceptionFilter } from "../../../src/nest/exception.filter";

interface CapturedResponse {
  body?: unknown;
  status?: number;
}

function makeHost(): { host: ArgumentsHost; captured: CapturedResponse } {
  const captured: CapturedResponse = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: <T = unknown>(): T => res as unknown as T,
      getRequest: () => ({}),
      getNext: () => () => {},
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe("PlatformExceptionFilter", () => {
  it("maps PlatformError → status + wire envelope verbatim", () => {
    const { host, captured } = makeHost();
    const filter = new PlatformExceptionFilter();

    filter.catch(new PlatformError(SAMPLE, "Sample 'x' not found"), host);

    expect(captured.status).toBe(SAMPLE.status);
    expect(captured.body).toEqual({
      error: {
        code: SAMPLE.code,
        message: "Sample 'x' not found",
        description: SAMPLE.description,
      },
    });
  });

  it("includes `details` when PlatformError carries them", () => {
    const { host, captured } = makeHost();
    const filter = new PlatformExceptionFilter();
    filter.catch(
      new PlatformError(ValidationErrors.FAILED, "bad input", {
        details: { field: "email" },
      }),
      host
    );
    expect(captured.body).toMatchObject({
      error: { details: { field: "email" } },
    });
  });

  it("respects statusCode override on PlatformError", () => {
    const { host, captured } = makeHost();
    const filter = new PlatformExceptionFilter();
    filter.catch(
      new PlatformError(SAMPLE, undefined, { statusCode: 410 }),
      host
    );
    expect(captured.status).toBe(410);
  });

  it("maps BadRequestException → VALIDATION_FAILED envelope", () => {
    const { host, captured } = makeHost();
    const filter = new PlatformExceptionFilter();
    filter.catch(
      new BadRequestException({
        message: ["email must be an email"],
        error: "Bad Request",
      }),
      host
    );
    expect(captured.status).toBe(400);
    expect(captured.body).toMatchObject({
      error: {
        code: ValidationErrors.FAILED.code,
        description: ValidationErrors.FAILED.description,
        details: { message: ["email must be an email"], error: "Bad Request" },
      },
    });
  });

  it("maps NotFoundException → HTTP_NOT_FOUND with preserved status", () => {
    const { host, captured } = makeHost();
    const filter = new PlatformExceptionFilter();
    filter.catch(new NotFoundException("missing"), host);
    expect(captured.status).toBe(404);
    expect(captured.body).toMatchObject({
      error: { code: "HTTP_NOT_FOUND", description: "Not Found" },
    });
  });

  it("maps a generic HttpException using its status text", () => {
    const { host, captured } = makeHost();
    const filter = new PlatformExceptionFilter();
    // Use a class that the filter does NOT specifically map (Forbidden,
    // Unauthorized, BadRequest, NotFound all have special handling — see
    // src/nest/exception.filter.ts). Conflict falls through to the
    // generic HTTP_<STATUS_TEXT> branch.
    filter.catch(new ConflictException("nope"), host);
    expect(captured.status).toBe(409);
    expect(captured.body).toMatchObject({
      error: { code: "HTTP_CONFLICT", description: "Conflict" },
    });
  });

  it("maps ForbiddenException to PERMISSION_FORBIDDEN, keeping the status", () => {
    const { host, captured } = makeHost();
    const filter = new PlatformExceptionFilter();
    filter.catch(new ForbiddenException("nope"), host);
    expect(captured.status).toBe(403);
    expect(captured.body).toMatchObject({
      error: { code: "PERMISSION_FORBIDDEN" },
    });
  });

  it("falls through unknown HttpException statuses to a synthesized code", () => {
    const { host, captured } = makeHost();
    const filter = new PlatformExceptionFilter();
    filter.catch(new HttpException("teapot", 418), host);
    expect(captured.status).toBe(418);
    expect(captured.body).toMatchObject({
      error: { code: expect.stringMatching(/^HTTP_/) },
    });
  });

  it("maps unknown errors → INTERNAL_UNEXPECTED 500", () => {
    const { host, captured } = makeHost();
    const filter = new PlatformExceptionFilter();
    // Silence the noisy `logger.error` so the test output stays clean.
    const spy = vi
      .spyOn(filter["logger"], "error")
      .mockImplementation(() => {});

    filter.catch(new Error("boom"), host);

    expect(captured.status).toBe(InternalErrors.UNEXPECTED.status);
    expect(captured.body).toMatchObject({
      error: { code: "INTERNAL_UNEXPECTED" },
    });
    expect(spy).toHaveBeenCalled();
  });

  it("scrubs message of unknown exceptions — does not leak the raw error string", () => {
    const { host, captured } = makeHost();
    const filter = new PlatformExceptionFilter();
    vi.spyOn(filter["logger"], "error").mockImplementation(() => {});

    filter.catch(new Error("secret: db password=hunter2"), host);

    const body = captured.body as { error: { message: string } };
    expect(body.error.message).not.toContain("hunter2");
  });

  it("emits the AuthenticationErrors specs identically — status + code", () => {
    const cases = [
      AuthenticationErrors.PRINCIPAL_REQUIRED,
      AuthorizationErrors.FORBIDDEN,
      AuthorizationErrors.FORBIDDEN,
    ];
    for (const spec of cases) {
      const { host, captured } = makeHost();
      new PlatformExceptionFilter().catch(new PlatformError(spec), host);
      expect(captured.status).toBe(spec.status);
      expect(captured.body).toMatchObject({ error: { code: spec.code } });
    }
  });
});
