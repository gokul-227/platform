import { Module } from "@nestjs/common";

/**
 * Shared by the thread, message and run submodules: each declares
 * `@RequireRowPermit(..., THREAD_ROW)` and the kernel's guard does the read.
 */
@Module({
  providers: [],
  exports: [],
})
export class ThreadCommonModule {}
