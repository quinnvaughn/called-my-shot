# Build context is the repo root (pnpm workspace), not this directory.
# Deploy with: fly deploy --config apps/api/fly.toml   (run from the repo root)
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/schemas/package.json packages/schemas/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS runner
ENV NODE_ENV=production
COPY packages/schemas packages/schemas
COPY apps/api apps/api
WORKDIR /repo/apps/api
EXPOSE 4000
# Not `pnpm start` - that script hardcodes --env-file=.env, and there's no
# .env file in the image. Fly injects real process env vars instead.
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
