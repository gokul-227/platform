import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
import type { ResolvedScope } from "@aec-craft/platform-contracts";
import { FileIndexService } from "@aec-craft/platform-files-api/nest";
import type { RunFilesSource } from "@aec-craft/platform-threads-api/nest";
import { RunFilesSourceToken } from "@aec-craft/platform-threads-api/nest";
import { Global, Injectable, Module } from "@nestjs/common";

/**
 * Host adapter: satisfies the run executor's document capability with files-api's
 * own index service, in process.
 *
 * The alternative was reaching the same retrieval over an MCP connection, which
 * the executor already knows how to open. It is rejected here because that
 * connection carries an app-level bearer: every thread's search would run as one
 * shared identity, and the group filter inside the query would be evaluated
 * against a principal that is not the asker. A detached threads deployment would
 * implement this interface over HTTP with a delegated token instead.
 *
 * `readableGroups` is resolved per run from Keto, the same call a file listing
 * makes, so retrieval sees exactly the documents the asker could have browsed to.
 * The asker is the thread's own subject, carried on the run rather than inferred:
 * a background worker has no request principal, and guessing one is how retrieval
 * ends up answering as somebody else.
 */
@Injectable()
export class PlatformRunFilesSource implements RunFilesSource {
  constructor(
    private readonly index: FileIndexService,
    private readonly checks: AuthorizationService
  ) {}

  readableGroups(scope: ResolvedScope, subject: string): Promise<string[]> {
    // Only `subject` is read downstream: it is what the authorization store keys
    // its tuples on, and it is what a thread records as its owner.
    return this.checks.readableGroups({ subject } as never, scope);
  }

  context(
    scope: ResolvedScope,
    readableGroups: string[],
    input: {
      query: string;
      topK?: number;
      expand?: "none" | "neighbors" | "section";
    }
  ) {
    return this.index.context(scope, readableGroups, input);
  }
}

@Global()
@Module({
  providers: [
    PlatformRunFilesSource,
    { provide: RunFilesSourceToken, useClass: PlatformRunFilesSource },
  ],
  exports: [RunFilesSourceToken],
})
export class RunFilesSourceModule {}
