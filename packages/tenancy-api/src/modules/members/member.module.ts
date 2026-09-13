import { Module } from "@nestjs/common";

import { MemberService } from "./member.service";

/**
 * No controllers of its own: the two that exist are the organization's and the
 * project's, and each nests under the partition whose members it lists.
 */
@Module({
  providers: [MemberService],
  exports: [MemberService],
})
export class MemberModule {}
