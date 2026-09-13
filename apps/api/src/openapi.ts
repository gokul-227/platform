import { adminApiDocument } from "@aec-craft/platform-admin-api/nest";
import { analysisApiDocument } from "@aec-craft/platform-analysis-api/nest";
import { auditApiDocument } from "@aec-craft/platform-audit-api/nest";
import type { ApiDocumentSpec } from "@aec-craft/platform-common/nest";
import { filesApiDocument } from "@aec-craft/platform-files-api/nest";
import { graphApiDocument } from "@aec-craft/platform-graph-api/nest";
import { objectsApiDocument } from "@aec-craft/platform-objects-api/nest";
import { tenancyApiDocument } from "@aec-craft/platform-tenancy-api/nest";
import { threadsApiDocument } from "@aec-craft/platform-threads-api/nest";
import { usersApiDocument } from "@aec-craft/platform-users-api/nest";
import { Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import { patchNestJsSwagger } from "nestjs-zod";
import { requireEnv } from "./env";
import { hostApiDocument } from "./health/health.module";

/**
 * The API packages bound into this host — one OpenAPI document per package,
 * each defined by the package itself (`ApiDocumentSpec`). The first spec is
 * the portal's default source. Mounting a new package = one entry here.
 *
 * A spec with `portal: false` is built and scanned but neither served nor
 * offered in the portal. It stays in this array because the conventions and
 * validation gates read generated documents: a module in no document is checked
 * by nothing.
 */
export const API_DOCUMENTS: ApiDocumentSpec[] = [
  hostApiDocument,
  tenancyApiDocument,
  usersApiDocument,
  graphApiDocument,
  filesApiDocument,
  threadsApiDocument,
  auditApiDocument,
  analysisApiDocument,
  objectsApiDocument,
  adminApiDocument,
];

/**
 * How every document is scanned. Exported so a test can rebuild the documents
 * the portal serves rather than a lookalike.
 *
 * `autoTagControllers: false` stops Nest from auto-tagging every operation with
 * its controller class name, which would add phantom groups alongside the
 * explicit tags. `include` bounds the document to a package's module tree, and
 * `deepScanRoutes` reaches the modules those import and stops there, so a module
 * nested deeper has to be named in `include` itself.
 */
export function documentScanOptions(spec: ApiDocumentSpec) {
  return {
    autoTagControllers: false,
    include: spec.include,
    deepScanRoutes: true,
  };
}

/**
 * OpenAPI + Scalar setup.
 *
 *   GET /<spec.path>         Swagger UI per package (`/openapi`, `/openapi-files`)
 *   GET /<spec.path>.json    raw JSON spec
 *   GET /<spec.path>.yaml    raw YAML spec
 *   GET /docs                Scalar portal — one source per package document
 *   GET /                    redirects to /docs
 *
 * OAuth2 flows:
 *   - `clientCredentials` — paste a service id/secret, get a token.
 *   - `authorizationCode` — redirect through the auth app for a user-scoped
 *     token (PKCE). Both end up as Bearer JWTs.
 *
 * The `audience` parameter is what makes the issuer stamp `aud = PUBLIC_URL`,
 * which is what the guard verifies. Not RFC 8707 `resource`: this issuer accepts
 * that parameter and silently ignores it, so a token requested with it comes
 * back with an empty `aud` and is refused. The value must also be registered on
 * the client, or it is dropped the same way.
 *
 * Schemas are generated from `@aec-craft/platform-contracts` via `nestjs-zod`'s
 * `patchNestJsSwagger()` — DTOs built with `createZodDto(schema)` carry
 * their zod schema as metadata, and `@nestjs/swagger` reads it when assembling
 * the document.
 */
export function setupOpenApi(app: NestExpressApplication): void {
  patchNestJsSwagger();

  // Hydra, in platform-id. Not the retiring Better Auth issuer, whose endpoints
  // were under /api/auth/oauth2/*; Hydra serves the standard /oauth2/* paths.
  const issuer = requireEnv("OIDC_ISSUER");
  const publicUrl = requireEnv("PUBLIC_URL");
  // Registered in the console like any other client, so its id is configuration
  // rather than something this app resolves from a registry it should not know
  // about. The one value here that is legitimately absent: an environment whose
  // identity estate does not exist yet has no client to name. Unset degrades
  // the portal rather than breaking it, so it warns instead of throwing.
  const docsClientId = process.env.DOCS_OIDC_CLIENT_ID ?? "";
  if (!docsClientId) {
    Logger.warn(
      "DOCS_OIDC_CLIENT_ID is unset: the docs portal renders without a client, so nothing in it can authorize.",
      "OpenApi"
    );
  }

  const sources = API_DOCUMENTS.filter((spec) => spec.portal !== false).map(
    (spec, index) => {
      const builder = new DocumentBuilder()
        .addServer(publicUrl)
        .setTitle(spec.title)
        .setVersion(process.env.SERVICE_VERSION ?? "dev")
        .addBearerAuth(
          { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          "bearer"
        )
        .addOAuth2(
          {
            type: "oauth2",
            flows: {
              authorizationCode: {
                authorizationUrl: `${issuer}/oauth2/auth`,
                tokenUrl: `${issuer}/oauth2/token`,
                scopes: {
                  openid: "Confirm your identity",
                  profile: "See your basic profile",
                  email: "See your email address",
                  offline_access: "Stay signed in (refresh tokens)",
                },
              },
            },
          },
          "oauth2"
        );
      // Declaring tags up-front sets the sidebar order in Scalar — groups render
      // in the order they appear in the spec's `tags` array. The shared filter
      // grammar is documented once, on the Platform document (the portal's
      // default source), not repeated per package.
      for (const tag of spec.tags) {
        builder.addTag(tag.name, tag.description);
      }

      const document = SwaggerModule.createDocument(
        app,
        builder.build(),
        documentScanOptions(spec)
      );
      SwaggerModule.setup(spec.path, app, document, {
        jsonDocumentUrl: `${spec.path}.json`,
        yamlDocumentUrl: `${spec.path}.yaml`,
      });
      return {
        title: spec.sourceTitle,
        content: document,
        default: index === 0,
      };
    }
  );

  app.use(
    "/docs",
    apiReference({
      pageTitle: "Platform APIs",
      sources,
      theme: "default",
      authentication: {
        preferredSecurityScheme: "oauth2",
        securitySchemes: {
          oauth2: {
            flows: {
              authorizationCode: {
                "x-scalar-client-id": docsClientId,
                selectedScopes: [
                  "openid",
                  "profile",
                  "email",
                  "offline_access",
                ],
                "x-scalar-security-query": { audience: publicUrl },
                "x-scalar-security-body": { audience: publicUrl },
              },
              clientCredentials: {
                "x-scalar-security-body": { audience: publicUrl },
              },
            },
          },
        },
      },
    })
  );

  app
    .getHttpAdapter()
    .getInstance()
    .get("/", (_req: unknown, res: { redirect: (path: string) => void }) => {
      res.redirect("/docs");
    });
}
