/**
 * Standard (non-filter) query parameters for scoped list endpoints.
 *
 * Companion to `@ApiFilterQueries`. `nestjs-zod`'s `patchNestJsSwagger()`
 * patches only body / response *schema* generation, not `@Query()` DTO
 * parameter expansion. So query inputs that aren't declared in a `FilterSpec`
 * — the scope ids, pagination, and projection — produce ZERO OpenAPI
 * parameters unless documented explicitly. `@ApiFilterQueries` covers the
 * declared filters (+ `sort`); these decorators cover the shared shapes it is
 * structurally blind to, so Scalar / Swagger UI render the inputs and clients
 * can actually send them.
 *
 * Without this, a list endpoint whose scope id is required (or required via an
 * `orgId` XOR `projectId` refine) is un-callable from the docs: the UI offers
 * no field, the request omits the id, and the zod pipe answers 400.
 *
 * Purely additive to the generated document; runtime validation still reads
 * the zod schema on the DTO.
 */

import type { ListPagination } from "@aec-craft/platform-contracts";
import { applyDecorators } from "@nestjs/common";
import { ApiQuery } from "@nestjs/swagger";

/**
 * The `orgId` / `projectId` scope pair plus `scope`, for a list that addresses
 * its partition through the query rather than the path.
 *
 * Only threads still do: every other collection nests under `/orgs/:orgId` or
 * `/projects/:projectId`, where the partition is a path parameter and the permit
 * guard can read it before the query is parsed. Exactly one of the two ids is
 * required at runtime (the DTO refines it); both are advertised as optional
 * because OpenAPI cannot express the XOR.
 */
/**
 * The scope pair a parameterised collection takes: exactly one of `orgId` or
 * `projectId`. OpenAPI cannot express the exclusivity, so each is optional and
 * the constraint is in the description; the schema refuses both-or-neither.
 */
export function ApiScopeQueries(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiQuery({
      name: "orgId",
      required: false,
      type: String,
      description:
        "Read this organization (uuid). Exactly one of `orgId` or `projectId`.",
    }),
    ApiQuery({
      name: "projectId",
      required: false,
      type: String,
      description:
        "Read this project (uuid). Exactly one of `orgId` or `projectId`.",
    })
  );
}

/** For a surface that only exists on a project: the id is required. */
export function ApiProjectScopeQuery(): MethodDecorator & ClassDecorator {
  return ApiQuery({
    name: "projectId",
    required: true,
    type: String,
    description: "The project to read (uuid).",
  });
}

export function ApiScopeAddressQueries(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiQuery({
      name: "orgId",
      required: false,
      type: String,
      description:
        "List in this organization's shared library (uuid). Mutually exclusive with `projectId`; provide exactly one.",
    }),
    ApiQuery({
      name: "projectId",
      required: false,
      type: String,
      description:
        "List visible from this project (uuid). Mutually exclusive with `orgId`; provide exactly one. " +
        "Hydrates the parent org's shared library by default; narrow with `scope`.",
    }),
    ApiHydrationQuery()
  );
}

/**
 * The `scope` narrowing on a project-nested list.
 *
 * A project list returns its own rows hydrated with the parent org's shared
 * library, and this is what chooses between the three answers. Distinct from
 * scope *addressing*, which the path now carries: this survived the nesting and
 * has to be documented wherever it is accepted, or a caller reads the tag
 * description telling them to use a parameter the operation does not offer.
 */
export function ApiHydrationQuery(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiQuery({
      name: "scope",
      required: false,
      enum: ["project", "org"],
      description:
        "Narrow the hydrated list: `project` returns the project's own rows, `org` only the inherited " +
        "org-scoped rows. Default returns both.",
    })
  );
}

/**
 * Pagination params for a list endpoint. Pass the endpoint's `ListSpec`
 * pagination block to advertise exactly the allowed modes; the no-argument
 * form documents cursor mode only.
 */
export function ApiPaginationQueries(
  pagination: ListPagination = { modes: ["cursor"], default: "cursor" }
): MethodDecorator & ClassDecorator {
  const decorators: Array<MethodDecorator & ClassDecorator> = [];
  if (pagination.modes.includes("cursor")) {
    decorators.push(
      ApiQuery({
        name: "limit",
        required: false,
        type: Number,
        description: "Cursor mode: page size, 1-200. Default 50.",
      }),
      ApiQuery({
        name: "cursor",
        required: false,
        type: String,
        description:
          "Cursor mode: opaque cursor returned by the previous page.",
      })
    );
  }
  if (pagination.modes.includes("offset")) {
    decorators.push(
      ApiQuery({
        name: "page",
        required: false,
        type: Number,
        description: "Offset mode: 1-based page number. Default 1.",
      }),
      ApiQuery({
        name: "pageSize",
        required: false,
        type: Number,
        description: "Offset mode: rows per page, 1-200. Default 50.",
      })
    );
  }
  return applyDecorators(...decorators);
}

/** The repeatable `?select=` projection over a row's `properties` bag. */
export function ApiSelectQuery(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiQuery({
      name: "select",
      required: false,
      type: String,
      isArray: true,
      description:
        "Top-level `properties` keys to include (repeatable: `?select=a&select=b`). Missing keys come " +
        "back `null`; omit to receive every property.",
    })
  );
}
