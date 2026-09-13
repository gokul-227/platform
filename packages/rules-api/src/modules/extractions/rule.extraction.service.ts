import type { ResolvedScope } from "@aec-craft/platform-contracts";
import { InternalErrors, PlatformError } from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { Injectable } from "@nestjs/common";
import type { StartRuleExtractionDto } from "./rule.extraction.dtos";

/**
 * The seam, not the pipeline: every method answers 501. The signatures are the
 * settled part, so filling in the bodies is the whole of the work.
 * TODO(#232): the extraction pipeline.
 */
@Injectable()
export class RuleExtractionService {
  start(
    _scope: ResolvedScope,
    _actor: Principal,
    _dto: StartRuleExtractionDto
  ): Promise<never> {
    return this.pending();
  }

  list(_scope: ResolvedScope, _readable: readonly string[]): Promise<never> {
    return this.pending();
  }

  findById(_actor: Principal, _runId: string): Promise<never> {
    return this.pending();
  }

  coverage(
    _scope: ResolvedScope,
    _readable: readonly string[]
  ): Promise<never> {
    return this.pending();
  }

  vocabulary(
    _scope: ResolvedScope,
    _readable: readonly string[]
  ): Promise<never> {
    return this.pending();
  }

  private pending(): Promise<never> {
    return Promise.reject(new PlatformError(InternalErrors.NOT_IMPLEMENTED));
  }
}
