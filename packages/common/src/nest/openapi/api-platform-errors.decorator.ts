import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";
import { applyDecorators } from "@nestjs/common";
import { ApiExtraModels, ApiResponse, getSchemaPath } from "@nestjs/swagger";
import { PlatformErrorBodyDto } from "./platform.error.body.dto";

/**
 * Per-route error documentation. Pass any number of `PlatformErrorSpec`s; the
 * decorator groups them by HTTP status and emits one `@ApiResponse` per
 * status, with the `PlatformErrorBody` schema as the body and one named
 * example per code so callers see exactly which `code` strings can appear.
 *
 * Usable at controller and method level — class-level decorators apply to
 * every method; method-level adds on top. Method-level takes precedence on
 * status collisions (Nest swagger's behavior), so put cross-cutting codes
 * (`PRINCIPAL_REQUIRED`, `INTERNAL_UNEXPECTED`) at the controller and route-
 * specific codes at the method.
 *
 *   @ApiPlatformErrors(AuthenticationErrors.PRINCIPAL_REQUIRED, InternalErrors.UNEXPECTED)
 *   export class UserController { ... }
 *
 *   @Get("users/:userId")
 *   @ApiPlatformErrors(AuthorizationErrors.STAFF_REQUIRED, UserErrors.NOT_FOUND)
 *   findById(...) { ... }
 */
export const ApiPlatformErrors = (
  ...specs: PlatformErrorSpec[]
): ClassDecorator & MethodDecorator => {
  const byStatus = new Map<number, PlatformErrorSpec[]>();
  for (const spec of specs) {
    const list = byStatus.get(spec.status);
    if (list) {
      list.push(spec);
    } else {
      byStatus.set(spec.status, [spec]);
    }
  }

  const decorators: (ClassDecorator | MethodDecorator)[] = [
    ApiExtraModels(PlatformErrorBodyDto),
  ];

  for (const [status, group] of byStatus) {
    decorators.push(
      ApiResponse({
        status,
        description: group
          .map((g) => `\`${g.code}\` — ${g.description}`)
          .join("\n\n"),
        content: {
          "application/json": {
            schema: { $ref: getSchemaPath(PlatformErrorBodyDto) },
            examples: Object.fromEntries(
              group.map((g) => [
                g.code,
                {
                  summary: g.name,
                  value: {
                    error: {
                      code: g.code,
                      message: g.name,
                      description: g.description,
                    },
                  },
                },
              ])
            ),
          },
        },
      })
    );
  }

  return applyDecorators(...decorators);
};
