import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { AppModule } from "./app.module";
import { corsOptions } from "./cors";
import { setupOpenApi } from "./openapi";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Graph changesets arrive as large JSON bodies (batched import ops); the
  // express default of 100kb rejects them mid-import.
  app.useBodyParser("json", { limit: "10mb" });

  const cors = corsOptions();
  if (cors) {
    app.enableCors(cors);
  }
  // Three overrides for the docs UI, and they apply to the docs UI only. They
  // were global, which turned a concession to one HTML page into the whole
  // API's posture:
  //   - CSP off: Scalar loads its bundle from a CDN, blocked by `script-src 'self'`.
  //   - COOP off: even `same-origin-allow-popups` blocks Scalar's polling loop
  //     from reading `popup.location.href` while the popup is on a different
  //     origin (the auth app), which the browser flags repeatedly. Without a
  //     COOP header the browser defaults to `unsafe-none` and the OAuth
  //     popup→opener→redirect cycle completes cleanly.
  //   - CORP off: defaults to `same-origin` and breaks Scalar's CDN-served
  //     fonts/assets that load with no CORP header of their own.
  //
  // Everything else answers JSON, where the three headers cost nothing, so the
  // defaults stand there rather than being given up estate-wide.
  const docsHelmet = helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
  });
  const strictHelmet = helmet();
  app.use((req: { path?: string }, res: unknown, next: unknown) => {
    const path = req.path ?? "";
    const isDocs = path === "/docs" || path.startsWith("/openapi");
    return (isDocs ? docsHelmet : strictHelmet)(
      req as never,
      res as never,
      next as never
    );
  });
  app.use(compression());
  app.use(
    pinoHttp({
      level: process.env.LOG_LEVEL ?? "info",
      // Probe noise hurts more than it helps — k8s hits these every few
      // seconds; the actual signal is in the request handlers.
      autoLogging: {
        ignore: (req) => req.url === "/health" || req.url === "/ready",
      },
      // Single-line message per request. Default pino-http dumps the entire
      // req+res object as JSON, which is noisy in dev. Structured fields
      // (method, url, statusCode) are still emitted for log parsers, just
      // trimmed.
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) {
          return "error";
        }
        if (res.statusCode >= 400) {
          return "warn";
        }
        return "info";
      },
      customSuccessMessage: (req, res, responseTime) =>
        `${req.method ?? ""} ${req.url ?? ""} ${res.statusCode} ${responseTime}ms`,
      customErrorMessage: (req, res, err) =>
        `${req.method ?? ""} ${req.url ?? ""} ${res.statusCode} ${err.message}`,
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      redact: ["req.headers.authorization", "req.headers.cookie"],
    })
  );

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.enableShutdownHooks();

  if (process.env.API_DOCS_ENABLED !== "false") {
    setupOpenApi(app);
  }

  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port, "0.0.0.0");
  Logger.log(`api listening on :${String(port)}`, "Bootstrap");
}

bootstrap().catch((err: unknown) => {
  console.error("api failed to start:", err);
  process.exit(1);
});
