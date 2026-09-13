import type { FilePipelineStep as FilePipelineStepName } from "@aec-craft/platform-contracts";

/**
 * A thing that happens to a file once its bytes are confirmed. It takes a file
 * id and a preset name and finds its own settings from that, so adding a step
 * teaches neither the upload path nor the routing anything.
 *
 * `enqueue` records intent rather than doing the work: the bytes are already in
 * the bucket, so a step that cannot be queued is degraded rather than failed.
 * Minutes of CPU hand off to something else here rather than run inline.
 */
export interface FilePipelineStep {
  /** Queue this file. The step resolves its own configuration from the preset. */
  enqueue(fileId: string, presetName: string): Promise<void>;
  /** Matches the name a preset's `pipeline` lists. */
  readonly name: FilePipelineStepName;
}

/**
 * Assembled by `FileModule`, the only place that knows which step modules are
 * mounted. A preset naming a step nothing registered is refused at boot.
 */
export const FilePipelineStepsToken = Symbol.for(
  "@aec-craft/platform-files-api:file-pipeline-steps"
);
