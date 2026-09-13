import { platformErrorBodySchema } from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

/**
 * Class wrapper around the error envelope schema, used purely as a stable
 * `$ref` target for `@ApiResponse` decorators. Every documented error
 * response references this single component so the docs surface one shape.
 */
export class PlatformErrorBodyDto extends createZodDto(
  platformErrorBodySchema
) {}
