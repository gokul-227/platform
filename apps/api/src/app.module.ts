import { AdminApiModule } from "@aec-craft/platform-admin-api/nest";
import { AnalysisApiModule } from "@aec-craft/platform-analysis-api/nest";
import { AuditApiModule } from "@aec-craft/platform-audit-api/nest";
import { AuthorizationModule } from "@aec-craft/platform-authorization/nest";
import { FilesApiModule } from "@aec-craft/platform-files-api/nest";
import { GraphApiModule } from "@aec-craft/platform-graph-api/nest";
import {
  PlatformIdModule,
  PrincipalGuard,
} from "@aec-craft/platform-id-resource-nestjs";
import { ObjectsApiModule } from "@aec-craft/platform-objects-api/nest";
import { OrgErrors, ProjectErrors } from "@aec-craft/platform-tenancy-api";
import { TenancyApiModule } from "@aec-craft/platform-tenancy-api/nest";
import { ThreadsApiModule } from "@aec-craft/platform-threads-api/nest";
import { UsersApiModule } from "@aec-craft/platform-users-api/nest";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { ZodValidationPipe } from "nestjs-zod";

import { jwksUrlFor, requireEnv } from "./env";
import { HealthModule } from "./health/health.module";
import { McpModule } from "./mcp/mcp.module";
import { OAuthMetadataController } from "./oauth.metadata.controller";
import { RunFilesSourceModule } from "./run-files.source";
import { RunGraphSourceModule } from "./run-graph.source";
import { WwwAuthenticateFilter } from "./www-authenticate.filter";

/**
 * Presets once the index is configured: `default` keeps storing anything, and
 * `document` is what a client names to make an upload searchable.
 *
 * The allowlist is what the extractor can actually read. Naming a type here that
 * nothing can extract would admit the upload and then fail it in the worker,
 * which reads as a broken pipeline rather than an unsupported format.
 */
const DOCUMENT_PRESETS = [
  {
    name: "default",
    maxFileSizeBytes: 5 * 1024 ** 3,
    acceptedContentTypes: null,
    pipeline: [],
  },
  {
    name: "document",
    maxFileSizeBytes: 200 * 1024 ** 2,
    acceptedContentTypes: [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
      // OCR-backed formats, admitted only when the deployment can extract
      // them; accepting them without OCR would upload files that never index.
      ...(ocrConfigured()
        ? [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/avif",
          ]
        : []),
    ],
    pipeline: ["index" as const],
  },
];

/**
 * `PlatformIdModule` provides the token verifier and `PrincipalGuard` is
 * registered as `APP_GUARD`, so every route is fail-closed; opt out with
 * `@Public()` from `@aec-craft/platform-id-resource-nestjs`.
 *
 * The guard verifies one signature against Hydra's published keys and never
 * calls the identity service, so this API answers requests while that service is
 * down. There is no fallback and no second token: a client obtains an access
 * token from Hydra for this resource and presents it here.
 */
@Module({
  imports: [
    // Authorization, global: the group tree, the check surface every other
    // package calls, and the per-request memo those checks share. Serves no
    // routes; the group surface itself is tenancy-api's.
    AuthorizationModule.forRoot({
      masks: {
        org: OrgErrors.NOT_FOUND,
        project: ProjectErrors.NOT_FOUND,
      },
      databaseUrl: sliceDatabaseUrl("AUTHORIZATION_DATABASE_URL"),
      ketoReadUrl: requireEnv("KETO_READ_URL"),
      ketoWriteUrl: requireEnv("KETO_WRITE_URL"),
      // On in a deployed environment, where Keto is IAM-gated. Off locally,
      // where it has no authentication and is bound to loopback.
      ketoIdentityTokens: process.env.KETO_IDENTITY_TOKENS === "true",
    }),
    // API packages, all over the shared platform database.
    FilesApiModule.forRoot({
      databaseUrl: sliceDatabaseUrl("FILES_DATABASE_URL"),
      // Unset = file byte-ops answer 503; folder ops still work.
      ...(process.env.FILE_STORAGE_BUCKET
        ? { fileStorage: fileStorage() }
        : {}),
      // Unset = documents are stored but not searchable; the index routes 503.
      // The `document` preset comes with it, since a preset naming the `index`
      // step is refused at boot when there is nothing to run it.
      ...(process.env.PINECONE_API_KEY
        ? { documentIndex: documentIndex(), presets: DOCUMENT_PRESETS }
        : {}),
    }),
    GraphApiModule.forRoot({
      databaseUrl: sliceDatabaseUrl("GRAPH_DATABASE_URL"),
      // Unset = graph routes degrade: /graph/query answers 503, the sync worker
      // stays dormant, the graph_version feed accumulates harmlessly.
      ...(process.env.GRAPH_DB_URI
        ? {
            graphDatabase: {
              uri: process.env.GRAPH_DB_URI,
              ...(process.env.GRAPH_DB_USERNAME
                ? { username: process.env.GRAPH_DB_USERNAME }
                : {}),
              ...(process.env.GRAPH_DB_PASSWORD
                ? { password: process.env.GRAPH_DB_PASSWORD }
                : {}),
              ...(process.env.GRAPH_DB_ENGINE === "neo4j"
                ? { engine: "neo4j" as const }
                : {}),
              ...(process.env.GRAPH_SYNC_ENABLED === "false"
                ? { syncEnabled: false }
                : {}),
            },
          }
        : {}),
    }),
    // Orgs, projects and the group tree inside them.
    TenancyApiModule.forRoot({
      databaseUrl: sliceDatabaseUrl("TENANCY_DATABASE_URL"),
    }),
    UsersApiModule.forRoot({
      databaseUrl: sliceDatabaseUrl("USERS_DATABASE_URL"),
      // Shared secret for the identity provider's back-channel. Optional
      // locally (the hook is unexercised); required in deployed environments.
      ...(process.env.IDENTITY_WEBHOOK_SECRET
        ? { identityWebhookSecret: process.env.IDENTITY_WEBHOOK_SECRET }
        : {}),
    }),
    AuditApiModule.forRoot({
      databaseUrl: sliceDatabaseUrl("AUDIT_DATABASE_URL"),
    }),
    ThreadsApiModule.forRoot({
      databaseUrl: sliceDatabaseUrl("THREADS_DATABASE_URL"),
      // Unset = the run worker stays dormant and runs sit `queued` (a client
      // may finalize them itself). The tier→model map lives in the executor;
      // region is the only deployment knob.
      ...(process.env.LLM_ENABLED === "true"
        ? {
            llm: process.env.VERTEX_REGION
              ? { region: process.env.VERTEX_REGION }
              : {},
          }
        : {}),
      // Local/ops only — never enable in production (raw query traces are not
      // user-facing).
      runDebug: process.env.DEBUG === "true",
    }),
    // Named computations over a project's model. Nothing to configure: it owns no
    // tables and reads the graph slice's connections, which are global.
    AnalysisApiModule,
    // The two halves of the graph as their own resources. Also no tables: each
    // narrows graph_node to one node type and reads it through the graph slice.
    ObjectsApiModule,
    // The staff surface. Owns no tables and serves no customer: every route
    // delegates to the package that owns the row, gated on the staff role.
    AdminApiModule,
    // The run executor's graph tools, adapted over graph-api's services.
    RunGraphSourceModule,
    // And its document tool, over files-api's index. In process, so retrieval
    // runs as the thread's own subject rather than a shared connection identity.
    RunFilesSourceModule,
    // The MCP transport. This API is the resource server for it, so the token a
    // client obtains for `/mcp` is the one every tool call runs under; #167 has
    // the measurement that made a separate gateway unworkable.
    McpModule,
    HealthModule,
    // Audience is this API's own URL: a client names the resource it wants a
    // token for with RFC 8707 `resource`, an absolute URI, and the issuer stamps
    // it into `aud`. Both sides read PUBLIC_URL, so they cannot drift.
    //
    // Stated rather than defaulted, because the package falls back to a
    // cleartext localhost issuer and a wrong value here surfaces only as 401 on
    // every gated route while /health stays green.
    PlatformIdModule.forRoot({
      audience: requireEnv("PUBLIC_URL"),
      issuer: requireEnv("OIDC_ISSUER"),
      jwksUrl: jwksUrlFor(requireEnv("OIDC_ISSUER")),
    }),
    // Per-principal rate limit (see PrincipalThrottlerGuard). In-memory store,
    // so per-instance under horizontal scaling.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 240 }]),
  ],
  controllers: [OAuthMetadataController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    // The platform envelope plus the RFC 9728 challenge on 401, which is what
    // lets an MCP client discover where to authenticate.
    {
      provide: APP_FILTER,
      useFactory: () => new WwwAuthenticateFilter(requireEnv("PUBLIC_URL")),
    },
    // First: everything below reads the principal it attaches.
    { provide: APP_GUARD, useClass: PrincipalGuard },
  ],
})
export class AppModule {}

/**
 * Storage backend for the files module. GCS by default (what this deployment
 * runs on); `FILE_STORAGE_PROVIDER=s3` targets any S3-compatible service, which
 * is how the platform runs outside Google Cloud.
 */
function fileStorage() {
  const bucket = requireEnv("FILE_STORAGE_BUCKET");
  if (process.env.FILE_STORAGE_PROVIDER === "s3") {
    return {
      provider: "s3" as const,
      bucket,
      region: requireEnv("FILE_STORAGE_REGION"),
      accessKeyId: requireEnv("FILE_STORAGE_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("FILE_STORAGE_SECRET_ACCESS_KEY"),
      // Self-hosted services (MinIO, Ceph) need both of these; AWS needs neither.
      ...(process.env.FILE_STORAGE_ENDPOINT
        ? {
            endpoint: process.env.FILE_STORAGE_ENDPOINT,
            forcePathStyle: process.env.FILE_STORAGE_PATH_STYLE !== "false",
          }
        : {}),
    };
  }
  return {
    provider: "gcs" as const,
    bucket,
    // Pins the resumable session to one browser origin. Only a bucket whose
    // CORS restricts origins needs it, and one value cannot serve two apps.
    ...(process.env.FILE_UPLOAD_ORIGIN
      ? { origin: process.env.FILE_UPLOAD_ORIGIN }
      : {}),
  };
}

/**
 * The document index: Pinecone for vectors, Vertex for embeddings and answers.
 *
 * `PINECONE_API_KEY` is the switch. Without it files are stored and downloadable
 * and the index routes answer 503, which is the state every environment is in
 * until an index exists for it. Vertex needs no key: on Cloud Run the service
 * identity is the credential.
 */
function documentIndex() {
  return {
    vectorStore: {
      provider: "pinecone" as const,
      apiKey: requireEnv("PINECONE_API_KEY"),
      indexHost: requireEnv("PINECONE_INDEX_HOST"),
    },
    embedder: {
      provider: "vertex" as const,
      ...(process.env.VERTEX_PROJECT_ID
        ? { projectId: process.env.VERTEX_PROJECT_ID }
        : {}),
      ...(process.env.VERTEX_LOCATION
        ? { location: process.env.VERTEX_LOCATION }
        : {}),
      // Must match the dimension the Pinecone index was created with; a
      // mismatch is rejected per request rather than at boot, so it is worth
      // setting both from one place.
      ...(process.env.RAG_DIMENSIONS
        ? { dimensions: Number(process.env.RAG_DIMENSIONS) }
        : {}),
    },
    // Retrieval works without this; only `ask` needs it.
    ...(process.env.VERTEX_ASK_MODEL === "none"
      ? {}
      : { answerer: { provider: "vertex" as const } }),
    // OCR: scanned PDFs, DOCX, PPTX and images, plus structured markdown for
    // every PDF. Off by default: it costs per page either way, and the Mistral
    // route sends the document out of this perimeter to their network.
    ...(ocr() ?? {}),
    // Figure captions ride on OCR and cost one Gemini call per figure;
    // VERTEX_CAPTION_MODEL=none opts out while keeping OCR.
    ...(ocrConfigured() && process.env.VERTEX_CAPTION_MODEL !== "none"
      ? {
          captioner: {
            provider: "vertex" as const,
            ...(process.env.VERTEX_CAPTION_MODEL
              ? { model: process.env.VERTEX_CAPTION_MODEL }
              : {}),
          },
        }
      : {}),
    // The lexical half. Postgres full-text search by default, over the chunk
    // table this package already owns: no extra vendor, and authorization is the
    // same predicate a file listing uses. `PINECONE_SPARSE_INDEX_HOST` switches
    // to a sparse Pinecone index instead.
    lexicalStore: process.env.PINECONE_SPARSE_INDEX_HOST
      ? {
          provider: "pinecone" as const,
          indexHost: process.env.PINECONE_SPARSE_INDEX_HOST,
        }
      : { provider: "postgres" as const },
  };
}

/**
 * OCR, by whichever route the deployment configured.
 *
 * `VERTEX_OCR_LOCATION` names the Model Garden region that serves Mistral OCR,
 * which needs no key: the runtime service identity is the credential, the pages
 * are processed in that region, and the usage bills through Google Cloud. It is
 * the region rather than a boolean because Model Garden publishes this model in
 * few regions and none of them has to be the one the embedder uses.
 *
 * `MISTRAL_API_KEY` is the other route, Mistral's own API. It fetches the
 * document by its signed URL, so the bytes leave this perimeter; the Vertex route
 * wins when both are set, being the one that does not.
 */
function ocr() {
  const shared = {
    ...(process.env.MISTRAL_OCR_MODEL
      ? { model: process.env.MISTRAL_OCR_MODEL }
      : {}),
    ...(process.env.MISTRAL_OCR_MAX_PAGES_PER_REQUEST
      ? {
          maxPagesPerRequest: Number(
            process.env.MISTRAL_OCR_MAX_PAGES_PER_REQUEST
          ),
        }
      : {}),
  };
  if (process.env.VERTEX_OCR_LOCATION) {
    return {
      ocr: {
        provider: "mistralVertex" as const,
        location: process.env.VERTEX_OCR_LOCATION,
        ...shared,
      },
    };
  }
  if (process.env.MISTRAL_API_KEY) {
    return {
      ocr: {
        provider: "mistral" as const,
        apiKey: process.env.MISTRAL_API_KEY,
        ...shared,
      },
    };
  }
  return;
}

/** Whether anything can read a scan, which the `document` preset admits on. */
function ocrConfigured(): boolean {
  return Boolean(
    process.env.VERTEX_OCR_LOCATION ?? process.env.MISTRAL_API_KEY
  );
}

/**
 * A slice shares `DATABASE_URL` unless it has been split onto its own database.
 * Each migrator reads the same per-slice variable, so the app and its migrations
 * cannot end up pointed at different databases — which they silently did while
 * this read `DATABASE_URL` directly.
 */
function sliceDatabaseUrl(envVar: string): string {
  return process.env[envVar] ?? requireEnv("DATABASE_URL");
}
