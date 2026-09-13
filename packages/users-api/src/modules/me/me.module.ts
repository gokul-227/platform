import { Module } from "@nestjs/common";

import { UserModule } from "../user.module";
import { MeGroupModule } from "./groups/me.group.module";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";
import { MeMetadataModule } from "./metadata/me.metadata.module";

@Module({
  imports: [UserModule, MeMetadataModule, MeGroupModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
