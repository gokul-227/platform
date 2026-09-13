import {
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { WwwAuthenticateFilter } from "../../../src/www-authenticate.filter";

const PUBLIC_URL = "http://localhost:3200";
const EXPECTED_CHALLENGE =
  'Bearer resource_metadata="http://localhost:3200/.well-known/oauth-protected-resource"';

function mockResponse() {
  const setHeader = vi.fn();
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ setHeader, status, json }) as unknown as Response,
      getRequest: () => ({}),
      getNext: () => null,
    }),
  } as unknown as ArgumentsHost;
  return { host, setHeader, status, json };
}

describe("WwwAuthenticateFilter", () => {
  it("attaches the RFC 9728 challenge on a 401 HttpException", () => {
    const { host, setHeader, status } = mockResponse();

    new WwwAuthenticateFilter(PUBLIC_URL).catch(
      new HttpException(
        "Missing Authorization header",
        HttpStatus.UNAUTHORIZED
      ),
      host
    );

    expect(setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      EXPECTED_CHALLENGE
    );
    expect(status).toHaveBeenCalledWith(401);
  });

  // The guard refuses with Nest's UnauthorizedException, which the platform
  // filter maps to ACCESS_PRINCIPAL_REQUIRED. The challenge has to survive that
  // mapping, since this is the path a real unauthenticated client takes.
  it("attaches the challenge on the guard's UnauthorizedException and keeps the platform envelope", () => {
    const { host, setHeader, status, json } = mockResponse();

    new WwwAuthenticateFilter(PUBLIC_URL).catch(
      new UnauthorizedException(),
      host
    );

    expect(setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      EXPECTED_CHALLENGE
    );
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "ACCESS_PRINCIPAL_REQUIRED" }),
      })
    );
  });

  it("does not attach the challenge on non-401 errors", () => {
    const { host, setHeader, status } = mockResponse();

    new WwwAuthenticateFilter(PUBLIC_URL).catch(
      new HttpException("Boom", HttpStatus.INTERNAL_SERVER_ERROR),
      host
    );

    expect(setHeader).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(500);
  });

  it("does not attach the challenge on a non-HTTP throw", () => {
    const { host, setHeader, status } = mockResponse();

    new WwwAuthenticateFilter(PUBLIC_URL).catch(new Error("kaboom"), host);

    expect(setHeader).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(500);
  });
});
