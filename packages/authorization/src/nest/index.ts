// What another package needs from here is small on purpose. A route declares
// one of three things and never imports a guard:
//
//   @RequirePermit("write")                     the request names its scope
//   @RequireRowPermit("read", { table, … })     the row knows its scope
//   @RequireStaff()                             the staff surface
//
//   AuthorizationService  the three questions, for a service that has to ask
//   CurrentScope          the scope a guard resolved, to stamp on a new row

export { AuthorizationModule } from "../authorization.module";
export { AuthorizationService } from "../authorization.service";
export {
  AuthorizationCacheInterceptor,
  memoizePerRequest,
  withAuthorizationCache,
} from "../cache";
export {
  DatabaseModule,
  DatabasePoolToken,
  DatabaseToken,
} from "../database/database.module";
export {
  type RequiredRowPermit,
  RequiredRowPermitMetadataKey,
  RequireRowPermit,
  RowPermitGuard,
  type RowPermitSource,
} from "../guards/row.permit.guard";
export {
  CurrentScope,
  type PermitRequest,
  type RequiredPermit,
  RequiredPermitMetadataKey,
  RequirePermit,
  ScopePermitGuard,
} from "../guards/scope.permit.guard";
export { RequireStaff, StaffGuard } from "../guards/staff.guard";
export {
  resolveScopeRef,
  type ScopeRef,
  type ScopeRequest,
} from "../scope";
