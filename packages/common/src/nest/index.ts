// NestJS bindings for `@aec-craft/platform-common`.
//
// `openapi/` is everything that only shapes the generated document; the
// exception filter beside it decides what a failing request actually answers.

export { PlatformExceptionFilter } from "./exception.filter";
export { ApiFilterQueries } from "./openapi/api-filter-queries.decorator";
export {
  ApiPathParams,
  type PathParamName,
} from "./openapi/api-path-params.decorator";
export { ApiPlatformErrors } from "./openapi/api-platform-errors.decorator";
export {
  ApiHydrationQuery,
  ApiPaginationQueries,
  ApiProjectScopeQuery,
  ApiScopeAddressQueries,
  ApiScopeQueries,
  ApiSelectQuery,
} from "./openapi/api-standard-queries.decorator";
export {
  type ApiDocumentSpec,
  LIST_FILTER_TAG,
} from "./openapi/openapi";
export { PlatformErrorBodyDto } from "./openapi/platform.error.body.dto";
