import { bootstrapTestApp, dbAvailable } from "@aec-craft/platform-testing";
import type { INestApplication } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import { DiscoveryService } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * That every `@Body`/`@Query` parameter still reaches the validation pipe.
 *
 * `ZodValidationPipe` finds a schema through the parameter's reflected type and
 * returns the value untouched when that type is not a zod DTO. So a DTO imported
 * as `import type` is erased to `Object`, the pipe silently declines, and the
 * handler receives whatever the wire carried: no refusal, no log, and a shape
 * the types promise cannot hold. Every validated route in the API was in that
 * state, which surfaced only when a single `?userId=` arrived as a bare string
 * where an array was declared and each character became a query parameter.
 *
 * Asserted over the reflected metadata rather than by exercising routes, because
 * the fault is per-parameter and invisible from a response: an unvalidated body
 * of the right shape answers exactly like a validated one.
 */
describe.skipIf(!dbAvailable())("request validation wiring (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("every @Body/@Query parameter carries a zod DTO the pipe can read", () => {
    const validated = app
      .get(DiscoveryService)
      .getControllers()
      .flatMap(({ metatype }) =>
        metatype ? validatedParameters(metatype) : []
      );

    // Guards the enumeration itself: a discovery change that returned nothing
    // would otherwise pass as "no bad parameters".
    expect(validated.length).toBeGreaterThan(15);
    expect(validated.filter((p) => !p.isZodDto).map((p) => p.where)).toEqual(
      []
    );
  });
});

interface ValidatedParameter {
  isZodDto: boolean;
  where: string;
}

/**
 * The `@Body`/`@Query` parameters of one controller, with whether the pipe can
 * resolve a schema from each.
 *
 * Both metadata keys are needed and neither is enough alone: the route-args map
 * says which positions were decorated, and `design:paramtypes` says what type
 * survived compilation into that position.
 */
function validatedParameters(controller: {
  name: string;
  prototype: object;
}): ValidatedParameter[] {
  const { prototype } = controller;
  const out: ValidatedParameter[] = [];

  for (const method of Object.getOwnPropertyNames(prototype)) {
    if (method === "constructor") {
      continue;
    }
    const args: Record<string, { data?: unknown; index: number }> =
      Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ?? {};
    const types: unknown[] =
      Reflect.getMetadata("design:paramtypes", prototype, method) ?? [];

    for (const [key, arg] of Object.entries(args)) {
      // Keys are `"<RouteParamtypes>:<index>"`, with a trailing segment when the
      // decorator was given an argument (`@Param("orgId")`).
      const paramtype = Number(key.split(":")[0]);
      if (
        paramtype !== RouteParamtypes.BODY &&
        paramtype !== RouteParamtypes.QUERY
      ) {
        continue;
      }
      // Only whole-object binding. `@Query("orgId") orgId: string` names one
      // value and is a string by design; a schema is owed by the parameter that
      // stands for the entire query or body.
      if (arg.data !== undefined) {
        continue;
      }
      const type = types[arg.index] as { isZodDto?: boolean } | undefined;
      out.push({
        isZodDto: type?.isZodDto === true,
        where: `${controller.name}.${method}[${arg.index}]`,
      });
    }
  }
  return out;
}
