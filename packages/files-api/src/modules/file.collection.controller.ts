import {
  AuthorizationService,
  RequirePermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiFilterQueries,
  ApiPaginationQueries,
  ApiPlatformErrors,
  ApiScopeQueries,
} from "@aec-craft/platform-common/nest";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  type CreateFileResponse,
  type FileListResponse,
  fileFilters,
  fileList,
  InternalErrors,
  scopeOfQuery,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import { Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  CreateFileDto,
  CreateFileResponseDto,
  FileListResponseDto,
  FileScopeQueryDto,
  ListFilesDto,
} from "./file.dtos";
import { FileErrors } from "./file.errors";
import { FileService } from "./file.service";

const PARENT_QUERY = {
  name: "parentId",
  required: false,
  type: String,
  description:
    "Browse one folder level: `eq.<folderId>` lists that folder's children, `eq.null` (or omit) lists the scope root.",
} as const;

const CREATE_ERRORS = [
  ValidationErrors.FAILED,
  FileErrors.PARENT_NOT_FOUND,
  FileErrors.PARENT_NOT_FOLDER,
  FileErrors.PARENT_CROSS_SCOPE,
  FileErrors.NAME_CONFLICT,
  FileErrors.EXTERNAL_ID_CONFLICT,
  FileErrors.PRESET_NOT_FOUND,
  FileErrors.TOO_LARGE,
  FileErrors.CONTENT_TYPE_NOT_ALLOWED,
  FileErrors.STORAGE_UNAVAILABLE,
] as const;

/**
 * The org's shared library and only that, unlike the org audit feed, which spans
 * its projects: a file is in exactly one scope, and a library sweeping up every
 * project's private files is a different collection wearing its name.
 *
 * The URL fixes the partition and the row filter still runs, because a
 * restricted group's files sit in this org and belong to somebody else.
 */
@ApiTags("Files")
@Controller("files")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class FileCollectionController {
  constructor(
    @Inject(FileService) private readonly files: FileService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Get()
  @RequirePermit("read")
  @ApiScopeQueries()
  @ApiOperation({
    summary: "List files and folders",
    description:
      "**Requires `read` on the organization or project named.** Name exactly one of `orgId` or `projectId`. A project read hydrates the parent org's library; `?scope=project` narrows to project-only. Browse a folder with `?parentId=eq.<id>` (`eq.null` for the root).",
  })
  @ApiResponse({ status: 200, type: FileListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiQuery(PARENT_QUERY)
  @ApiFilterQueries(fileFilters)
  @ApiPaginationQueries(fileList.pagination)
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListFilesDto
  ): Promise<FileListResponse> {
    const scope = await this.checks.scopeIn(scopeOfQuery(query));
    return await this.files.list(
      scope,
      query,
      await this.checks.readableGroups(principal, scope)
    );
  }

  @Post()
  @RequirePermit("write")
  @ApiScopeQueries()
  @ApiOperation({
    summary: "Create a file or folder",
    description:
      "**Requires `write` on the organization or project named, or on the `groupId` in the query when one is named.** " +
      "Name exactly one of `orgId` or `projectId`: the row lands in whichever it names. " +
      "`type: 'folder'` creates a tree node. `type: 'file'` creates a `pending` row and returns an `upload` ticket: " +
      "`type: 'put'` for a small file (one signed request), `type: 'resumable'` above the deployment's threshold " +
      "(chunked, pausable, resumable). Send the bytes straight to the bucket, then call `POST /files/:fileId/complete`.",
  })
  @ApiResponse({ status: 201, type: CreateFileResponseDto })
  @ApiPlatformErrors(...CREATE_ERRORS)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Query() query: FileScopeQueryDto,
    @Body() dto: CreateFileDto
  ): Promise<CreateFileResponse> {
    const scope = await this.checks.scopeIn(scopeOfQuery(query), dto.groupId);
    return await this.files.create(scope, dto, principal);
  }
}
