import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import type { JsonRpcResponse } from "./jsonrpc";
import { McpService } from "./mcp.service";

/**
 * The MCP transport endpoint. Agents POST JSON-RPC 2.0 messages here.
 *
 * `PrincipalGuard` has already verified the bearer against this API's own
 * audience by the time the handler runs, so the token handed to the service is
 * one issued to this server.
 *
 * Only the request/response half of MCP's "Streamable HTTP" transport is
 * implemented. Server-to-client notifications (SSE upgrade) are not, because no
 * tool pushes them; clients that ask for the notification stream see a missing
 * GET handler and fall back to the request/response path.
 *
 * Excluded from the OpenAPI document: one JSON-RPC envelope over one path is
 * not describable as REST, and the tool manifest is already discoverable
 * through `tools/list`.
 */
@ApiExcludeController()
@Controller("mcp")
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown
  ): Promise<JsonRpcResponse> {
    const bearer = extractBearer(authorization);
    return this.mcp.handle(body, bearer);
  }
}

const BEARER_PREFIX = /^Bearer\s+(.+)$/i;

function extractBearer(header: string | undefined): string {
  if (!header) {
    return "";
  }
  const match = BEARER_PREFIX.exec(header.trim());
  return match ? match[1]!.trim() : "";
}
