# syntax=docker/dockerfile:1.7
#
# Multi-stage build for @aec-craft/api.
#
#   1. deps    — install the full pnpm workspace
#   2. build   — compile @aec-craft/api + every workspace dep it transitively pulls in
#   3. deploy  — `pnpm deploy` hoists prod-only node_modules into a single folder
#   4. runtime — minimal node:alpine image with the deploy folder + dist/
#
# The cloud-run module sets `PORT` to `var.port` (3001), which the app reads via
# `process.env.PORT` in apps/api/src/main.ts. Listen address is 0.0.0.0.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /repo

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json .npmrc ./
COPY apps apps
COPY packages packages
# /root/.npmrc carries the GitHub Packages auth line (registry scope is already
# in the repo's .npmrc). Build-time only — secret never lands in image layers.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    --mount=type=secret,id=npmrc_auth,target=/root/.npmrc,required=true \
    pnpm install --frozen-lockfile

# ── build ─────────────────────────────────────────────────────────────────────
FROM deps AS build
RUN pnpm --filter @aec-craft/api... build

# ── deploy ────────────────────────────────────────────────────────────────────
# `pnpm deploy` produces a self-contained directory at /deploy with hoisted
# prod-only node_modules (every workspace dep resolved into real files, no
# symlinks pointing outside the directory). Source files (`dist/`) are not
# included by default — copy explicitly.
#
# It carries the same auth secret as the install above, because `--legacy`
# resolves the prod tree itself rather than copying the one already on disk. It
# needed no credential while every prod dependency was a workspace package or
# public npm; the first registry-scoped @aec-craft one answers 401 without it.
FROM build AS deploy
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    --mount=type=secret,id=npmrc_auth,target=/root/.npmrc,required=true \
    pnpm --filter @aec-craft/api deploy --prod --legacy /deploy && \
    cp -r apps/api/dist /deploy/dist

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deploy --chown=app:app /deploy /app
USER app
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/main.js"]
