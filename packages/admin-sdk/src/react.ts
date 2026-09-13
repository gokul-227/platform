// React bindings for the staff surface: TanStack Query hooks over `AdminClient`.
//
// `AdminProvider` carries no `QueryClient` of its own, so it nests inside the
// platform SDK's provider and both clients share one cache. Keys are rooted
// under `["admin"]` rather than `["platform"]`, so a console can clear the staff
// cache without dropping the product one.

export { adminKeys } from "./common/react/keys";
export {
  AdminProvider,
  type AdminProviderProps,
  useAdminClient,
} from "./common/react/provider";
export {
  useAddAdminMember,
  useAdminMembers,
  useRemoveAdminMember,
  useSetAdminMemberStanding,
} from "./members/react/member.hooks";
export {
  useAdminOrg,
  useAdminOrgs,
  useCreateAdminOrg,
  useDeleteAdminOrg,
  useUpdateAdminOrg,
} from "./orgs/react/org.hooks";
export {
  useAdminOrgProjects,
  useAdminProject,
  useAdminProjects,
  useUpdateAdminProject,
} from "./projects/react/project.hooks";
export {
  useAdminUser,
  useAdminUsers,
  useDeleteAdminUser,
} from "./users/react/user.hooks";
