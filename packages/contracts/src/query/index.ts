// `@aec-craft/platform-contracts` — how a resource declares what it can be asked.
//
// Core, and abstract. Four steps, one file per step:
//
//   declare   a resource names its filterable fields, their operators, and
//             whether each sorts              `filter.spec`  `list.spec`
//   publish   the declaration becomes zod, so the API's validator, the SDK's
//             type and the MCP tool's schema are one thing
//                                             `filter.schema`
//   parse     `?field=op.value` becomes resolved filters and a resolved sort;
//             `page` settles which pagination mode answers, `page.cursor` and
//             `page.offset` assemble it
//                                             `filter.parse` `filter.value` `page`
//   apply     resolved filters become SQL      `drizzle/filter.apply`
//
// **Nothing here may name a table, a column, a class, an edge type or a path
// prefix.** It used to: the aggregate compiler emitted `FROM graph_node` and
// carried an identity-column map, and the predicate vocabulary listed `storey`
// and `space` as path prefixes. Both were graph vocabulary wearing a generic
// package name. They moved out — the predicate shape and the aggregate spec to
// `contracts/src/graph`, the compiler and its cell readers to analysis-api,
// which was their only caller.
//
// The rule that replaces them: an operator a field does not allow, a value that
// will not coerce, a sort beside a cursor — refused through `failed()` as
// `VALIDATION_FAILED`, never guessed at and never passed through.
//
// The drizzle appliers are behind `@aec-craft/platform-common/drizzle` and must
// stay there: `contracts` depends on this entry and publishes to clients, so a
// client must never pull a database driver to read a type.

export { failed } from "./failure";
export {
  parseFilters,
  parseSort,
  type ResolvedFilter,
  type ResolvedSort,
} from "./filter.parse";
export { filtersToSchema, sortSchema } from "./filter.schema";
export {
  type ColumnFilter,
  column,
  columnFor,
  defineFilters,
  type FilterEntry,
  type FilterSpec,
  type JsonbPathFilter,
  jsonbPath,
  sortableFields,
} from "./filter.spec";
export { jsonbValueType, parseValue } from "./filter.value";
export {
  type CursorListResponse,
  defineListSpec,
  type ListPagination,
  type ListSpec,
  listInputSchema,
  listResponseSchema,
  type OffsetListResponse,
  type OffsetPageMeta,
  offsetPageMetaSchema,
  type PaginationMode,
} from "./list.spec";
export {
  ALL_FILTER_OPS,
  ALL_OPS_SET,
  exampleFor,
  type FilterOp,
  type FilterValueType,
  LIST_OPS,
  type OpExample,
  type ParsedFilter,
} from "./operator";
export {
  type CursorPageQuery,
  type OffsetPageQuery,
  type ResolvedPageQuery,
  resolvePageQuery,
} from "./page";
// `decodeCursor` is exported for the drizzle applier in
// `@aec-craft/platform-common/drizzle`, which turns a cursor into a keyset
// predicate. It was a sibling import while the dialect and its appliers were
// one package.
export {
  type Cursor,
  decodeCursor,
  fetchCursorPage,
} from "./page.cursor";
export { fetchOffsetPage } from "./page.offset";
