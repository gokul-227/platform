import { Inject, Injectable } from "@nestjs/common";

import { type Config, ConfigToken } from "../../config/config";
import type { FilePipelineStep } from "../file.pipeline";

import { FileIndexService } from "./file.index.service";

/**
 * An adapter rather than `FileIndexService` implementing the step interface, so
 * the pipeline's vocabulary stays out of the service. It reads the step's own
 * preset configuration, which is what lets the dispatcher stay ignorant.
 */
@Injectable()
export class FileIndexPipelineStep implements FilePipelineStep {
  readonly name = "index" as const;

  constructor(
    @Inject(FileIndexService) private readonly index: FileIndexService,
    @Inject(ConfigToken) private readonly config: Config
  ) {}

  async enqueue(fileId: string, presetName: string): Promise<void> {
    const preset = this.config.presets.find(
      (candidate) => candidate.name === presetName
    );
    await this.index.enqueue(fileId, {
      ...(preset?.index?.attributes
        ? { attributes: preset.index.attributes }
        : {}),
      ...(preset?.index?.chunking ? { chunking: preset.index.chunking } : {}),
    });
  }
}
