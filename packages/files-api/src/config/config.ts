import {
  chunkingOptionsSchema,
  filePipelineStepSchema,
  indexAttributesSchema,
  retrievalModeSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

export const DEFAULT_PRESET = "default";

/** GCS commits resumable chunks in 256 KiB units; anything else is rejected mid-upload. */
const CHUNK_UNIT_BYTES = 256 * 1024;

const storageBaseShape = {
  bucket: z.string().min(1),
  /**
   * At or below this size a file is uploaded with one signed PUT; above it the
   * client gets the backend's interruptible shape (chunked or multipart).
   */
  resumableThresholdBytes: z
    .number()
    .int()
    .positive()
    .default(8 * 1024 * 1024),
  /**
   * How long an upload may sit before the sweeper cancels it and removes the
   * pending row. Bounds how long a paused upload survives.
   */
  sessionTtlSeconds: z
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60),
};

const ocrBaseShape = {
  /**
   * The provider refuses requests past this many pages, so longer documents
   * are OCR'd in ranges of this size. 30 is Mistral's cap today; raise it
   * here when the provider raises theirs.
   */
  maxPagesPerRequest: z.number().int().min(1).default(30),
};

/**
 * Config for `FilesApiModule.forRoot()`, zod-validated at boot. The deployable
 * owns secret loading; this package never reads `process.env`.
 */
const ConfigSchema = z.object({
  databaseUrl: z.string().url(),
  /**
   * Unset: byte operations answer 503 and folder operations keep working. `s3`
   * covers every S3-compatible service, which is what a deployment outside
   * Google Cloud runs on.
   */
  fileStorage: z
    .discriminatedUnion("provider", [
      z.object({
        ...storageBaseShape,
        provider: z.literal("gcs"),
        chunkSizeBytes: z
          .number()
          .int()
          .positive()
          .multipleOf(CHUNK_UNIT_BYTES)
          .default(8 * 1024 * 1024),
        /**
         * Echoed by the bucket in the CORS preflight. Unset works for
         * same-origin and non-browser clients.
         */
        origin: z.string().url().optional(),
      }),
      z.object({
        ...storageBaseShape,
        provider: z.literal("s3"),
        region: z.string().min(1),
        accessKeyId: z.string().min(1),
        secretAccessKey: z.string().min(1),
        /** Unset targets AWS itself. */
        endpoint: z.string().url().optional(),
        /** Path-style addressing, which most self-hosted services need. */
        forcePathStyle: z.boolean().default(false),
        sessionToken: z.string().min(1).optional(),
        /** S3 requires at least 5 MiB for every part but the last. */
        partSizeBytes: z
          .number()
          .int()
          .min(5 * 1024 * 1024)
          .default(8 * 1024 * 1024),
      }),
    ])
    .optional(),
  /**
   * Published at `GET /files/presets`, so a client can reject a file before
   * sending any of it. `default` is what a create naming no preset gets.
   */
  presets: z
    .array(
      z.object({
        name: z.string().min(1),
        maxFileSizeBytes: z
          .number()
          .int()
          .positive()
          .default(5 * 1024 ** 3),
        /** MIME allowlist; entries may be wildcards (`image/*`). Null accepts any type. */
        acceptedContentTypes: z
          .array(z.string().min(1))
          .nullable()
          .default(null),
        /**
         * What runs once a file turns `ready`, in order. The step names are
         * published; their tuning is not, since a client cannot act on it.
         */
        pipeline: z.array(filePipelineStepSchema).default([]),
        /** Ingestion defaults for this preset's documents, used by `index`. */
        index: z
          .object({
            chunking: chunkingOptionsSchema.optional(),
            /** Attributes stamped on every chunk, filterable at search time. */
            attributes: indexAttributesSchema.optional(),
          })
          .optional(),
      })
    )
    .min(1)
    .default([
      {
        name: DEFAULT_PRESET,
        maxFileSizeBytes: 5 * 1024 ** 3,
        acceptedContentTypes: null,
        pipeline: [],
      },
    ])
    .refine((presets) => presets.some((p) => p.name === DEFAULT_PRESET), {
      message: `presets must include one named "${DEFAULT_PRESET}"`,
    }),
  /**
   * Unset: files are stored and downloadable, and every index endpoint answers
   * 503. A preset naming the `index` step without this is refused at boot,
   * rather than failing once per upload.
   */
  documentIndex: z
    .object({
      /** Pinecone serverless, addressed by its data-plane host. */
      vectorStore: z.object({
        provider: z.literal("pinecone"),
        apiKey: z.string().min(1),
        indexHost: z.string().min(1),
      }),
      /** The dimension must equal the vector index's. */
      embedder: z.object({
        provider: z.literal("vertex"),
        projectId: z.string().min(1).optional(),
        location: z.string().min(1).default("europe-west3"),
        model: z.string().min(1).default("gemini-embedding-001"),
        dimensions: z.number().int().positive().default(768),
        /** Inline service-account credentials. Omit on GCP, where ADC applies. */
        credentials: z
          .object({
            client_email: z.string().min(1),
            private_key: z.string().min(1),
            project_id: z.string().min(1).optional(),
          })
          .optional(),
      }),
      /** Unset: retrieval works and `ask` answers 503; a caller can format. */
      answerer: z
        .object({
          provider: z.literal("vertex"),
          model: z.string().min(1).default("gemini-2.5-flash"),
          location: z.string().min(1).default("global"),
        })
        .optional(),
      /**
       * Unset: only digital PDFs and plain text extract, and a scanned PDF
       * fails ingestion loudly rather than indexing as empty.
       *
       * One engine, two routes: `mistralVertex` keeps the pages in the region
       * named here on the runtime's own identity, `mistral` sends them outside
       * this perimeter.
       */
      ocr: z
        .discriminatedUnion("provider", [
          z.object({
            ...ocrBaseShape,
            provider: z.literal("mistralVertex"),
            /** Model Garden serves this in few regions. */
            location: z.string().min(1).default("europe-west4"),
            model: z.string().min(1).default("mistral-ocr-2505"),
            projectId: z.string().min(1).optional(),
          }),
          z.object({
            ...ocrBaseShape,
            provider: z.literal("mistral"),
            apiKey: z.string().min(1),
            model: z.string().min(1).default("mistral-ocr-latest"),
            baseUrl: z.string().url().optional(),
          }),
        ])
        .optional(),
      /**
       * OCR-extracted images become derived objects, and a vision model's
       * description of each joins the document's chunks, which is what makes a
       * drawing retrievable. One model call per figure, and `ocr` is required.
       */
      captioner: z
        .object({
          provider: z.literal("vertex"),
          model: z.string().min(1).default("gemini-2.5-flash"),
          location: z.string().min(1).default("global"),
        })
        .optional(),
      /**
       * What matches an exact standard number or drawing reference. Unset:
       * retrieval is semantic only, `hybrid` quietly means `semantic`, and
       * `lexical` answers 503.
       */
      lexicalStore: z
        .discriminatedUnion("provider", [
          /**
           * No extension and no model, and authorization is the predicate a
           * file listing already uses, so the two halves of a hybrid query
           * cannot drift apart on who may read what.
           */
          z.object({ provider: z.literal("postgres") }),
          /**
           * Serverless keeps sparse vectors in an index of their own, so this
           * is a host rather than a flag on the dense one. Term weighting is
           * ours: BM25 saturation, no corpus IDF.
           */
          z.object({
            provider: z.literal("pinecone"),
            /** Defaults to the dense index's key; the same project usually owns both. */
            apiKey: z.string().min(1).optional(),
            indexHost: z.string().min(1),
          }),
        ])
        .optional(),
      defaultMode: retrievalModeSchema.default("hybrid"),
      /** Deployment-wide chunking defaults; a preset or a call overrides them. */
      chunking: chunkingOptionsSchema.optional(),
      /** Documents claimed per worker pass. */
      ingestBatchSize: z.number().int().min(1).max(50).default(5),
    })
    .optional(),
});

/**
 * A preset may only name a step this deployment can run. Caught at boot, because
 * the alternative is an upload that succeeds and a pipeline that does nothing.
 */
const ValidatedConfigSchema = ConfigSchema.superRefine((config, ctx) => {
  if (config.documentIndex?.captioner && !config.documentIndex.ocr) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["documentIndex", "captioner"],
      message: "captioner needs ocr: figures only exist when OCR extracts them",
    });
  }
  if (!config.documentIndex) {
    for (const [position, preset] of config.presets.entries()) {
      if (preset.pipeline.includes("index")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["presets", position, "pipeline"],
          message: `preset "${preset.name}" names the "index" step, but documentIndex is not configured`,
        });
      }
    }
  }

  // Routed by content type, first match wins. Two presets claiming one type
  // would make this order decide the pipeline, which is a coin toss.
  const claimedBy = new Map<string, string>();
  for (const [position, preset] of config.presets.entries()) {
    if (
      preset.name === DEFAULT_PRESET ||
      preset.acceptedContentTypes === null
    ) {
      continue;
    }
    for (const pattern of preset.acceptedContentTypes) {
      const already = claimedBy.get(pattern);
      if (already) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["presets", position, "acceptedContentTypes"],
          message: `"${pattern}" is accepted by both "${already}" and "${preset.name}"; routing an upload that names no preset would depend on their order`,
        });
      } else {
        claimedBy.set(pattern, preset.name);
      }
    }
  }
});

/** The parsed config, every default resolved. */
export type Config = z.infer<typeof ConfigSchema>;
/** What a host passes to `forRoot()`: defaults may be omitted. */
export type ConfigInput = z.input<typeof ConfigSchema>;
export type FileStorageConfig = NonNullable<Config["fileStorage"]>;
export type UploadPresetConfig = Config["presets"][number];

export function parseConfig(input: unknown): Config {
  return ValidatedConfigSchema.parse(input);
}

export const ConfigToken = Symbol.for("@aec-craft/platform-files-api:config");
