import {
  classifyVocabulary,
  type VocabularyType,
} from "@aec-craft/platform-contracts";
import { Injectable, Logger } from "@nestjs/common";

/**
 * Classifies a vocabulary value against the canonical lists and counts the
 * non-canonical ones. Never throws: the vocabulary is open, and the counter is
 * what says which experimental values have earned promotion.
 *
 * The counter is an in-process map until OTLP replaces it.
 */
@Injectable()
export class GraphVocabularyService {
  private readonly logger = new Logger(GraphVocabularyService.name);
  private readonly counters = new Map<string, number>();

  /** Canonical values are silent; an experimental one counts and warns. */
  classify(type: VocabularyType, value: string, orgId: string): void {
    const classification = classifyVocabulary(type, value);
    if (classification === "canonical") {
      return;
    }
    this.incrementCounter(type, value, orgId);
    this.logger.warn(
      `graph vocabulary experimental: type=${type} value=${JSON.stringify(value)} orgId=${orgId}`
    );
  }

  /** Each top-level key of a property bag, against the canonical block keys. */
  classifyBlockKeys(
    properties: Record<string, unknown> | undefined,
    orgId: string
  ): void {
    if (!properties) {
      return;
    }
    for (const key of Object.keys(properties)) {
      this.classify("block_key", key, orgId);
    }
  }

  /** Snapshot of the in-process counter. Stable shape; safe to expose. */
  getCounters(): ReadonlyMap<string, number> {
    return new Map(this.counters);
  }

  private incrementCounter(
    type: VocabularyType,
    value: string,
    orgId: string
  ): void {
    const key = `${type}|${value}|${orgId}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }
}
