import {
  AuthorizationService,
  RequirePermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiPlatformErrors,
  ApiScopeQueries,
} from "@aec-craft/platform-common/nest";
import type {
  AskFilesResponse,
  ContextFilesResponse,
  RetrieveFilesResponse,
  SearchFilesResponse,
} from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  scopeOfQuery,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import { Body, Controller, Inject, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { FileScopeQueryDto } from "../file.dtos";
import {
  AskFilesDto,
  AskFilesResponseDto,
  ContextFilesResponseDto,
  RetrieveFilesDto,
  RetrieveFilesResponseDto,
  SearchFilesDto,
  SearchFilesResponseDto,
} from "./file.index.dtos";
import { FileIndexErrors } from "./file.index.errors";
import { FileIndexService } from "./file.index.service";

const RETRIEVAL_ERRORS = [
  ValidationErrors.FAILED,
  FileIndexErrors.NOT_CONFIGURED,
] as const;

const SEARCH_DESCRIPTION =
  "Ranks individual chunks by similarity to the query. The cheapest rung: one embedding call and one " +
  "vector query. Use it to point somebody at the right passage of the right document.";

const RETRIEVE_DESCRIPTION =
  "Search, then widen each hit with the text around it (`expand`), merge overlapping runs, and cut the " +
  "result to a token budget. Use it when the answer spans more than a single chunk.";

const CONTEXT_DESCRIPTION =
  "`retrieve`, formatted: one string with `[n]` markers, plus the sources those markers refer to. " +
  "Use it to build your own prompt while keeping citations you can resolve back to a file and page.";

const ASK_DESCRIPTION =
  "`context`, answered. The model is instructed to use the retrieved passages and nothing else, and to " +
  "cite each claim. When retrieval finds nothing it says so rather than answering from its own knowledge. " +
  "Needs an answer model configured; without one this answers 503 and the other three rungs still work.";

@ApiTags("File index")
@Controller("files")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class FileIndexCollectionController {
  constructor(
    @Inject(FileIndexService) private readonly index: FileIndexService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post("search")
  @RequirePermit("read")
  @ApiScopeQueries()
  @ApiOperation({
    summary: "Search indexed documents",
    description: `**Requires \`read\` on the organization or project named.** ${SEARCH_DESCRIPTION}`,
  })
  @ApiResponse({ status: 200, type: SearchFilesResponseDto })
  @ApiPlatformErrors(...RETRIEVAL_ERRORS)
  async search(
    @CurrentPrincipal() principal: Principal,
    @Query() query: FileScopeQueryDto,
    @Body() dto: SearchFilesDto
  ): Promise<SearchFilesResponse> {
    const scope = await this.checks.scopeIn(scopeOfQuery(query));
    return await this.index.search(
      scope,
      await this.checks.readableGroups(principal, scope),
      dto
    );
  }

  @Post("retrieve")
  @RequirePermit("read")
  @ApiScopeQueries()
  @ApiOperation({
    summary: "Retrieve passages",
    description: `**Requires \`read\` on the organization or project named.** ${RETRIEVE_DESCRIPTION}`,
  })
  @ApiResponse({ status: 200, type: RetrieveFilesResponseDto })
  @ApiPlatformErrors(...RETRIEVAL_ERRORS)
  async retrieve(
    @CurrentPrincipal() principal: Principal,
    @Query() query: FileScopeQueryDto,
    @Body() dto: RetrieveFilesDto
  ): Promise<RetrieveFilesResponse> {
    const scope = await this.checks.scopeIn(scopeOfQuery(query));
    return await this.index.retrieve(
      scope,
      await this.checks.readableGroups(principal, scope),
      dto
    );
  }

  @Post("context")
  @RequirePermit("read")
  @ApiScopeQueries()
  @ApiOperation({
    summary: "Build prompt context",
    description: `**Requires \`read\` on the organization or project named.** ${CONTEXT_DESCRIPTION}`,
  })
  @ApiResponse({ status: 200, type: ContextFilesResponseDto })
  @ApiPlatformErrors(...RETRIEVAL_ERRORS)
  async context(
    @CurrentPrincipal() principal: Principal,
    @Query() query: FileScopeQueryDto,
    @Body() dto: RetrieveFilesDto
  ): Promise<ContextFilesResponse> {
    const scope = await this.checks.scopeIn(scopeOfQuery(query));
    return await this.index.context(
      scope,
      await this.checks.readableGroups(principal, scope),
      dto
    );
  }

  @Post("ask")
  @RequirePermit("read")
  @ApiScopeQueries()
  @ApiOperation({
    summary: "Ask the documents a question",
    description: `**Requires \`read\` on the organization or project named.** ${ASK_DESCRIPTION}`,
  })
  @ApiResponse({ status: 200, type: AskFilesResponseDto })
  @ApiPlatformErrors(...RETRIEVAL_ERRORS)
  async ask(
    @CurrentPrincipal() principal: Principal,
    @Query() query: FileScopeQueryDto,
    @Body() dto: AskFilesDto
  ): Promise<AskFilesResponse> {
    const scope = await this.checks.scopeIn(scopeOfQuery(query));
    return await this.index.ask(
      scope,
      await this.checks.readableGroups(principal, scope),
      dto
    );
  }
}
