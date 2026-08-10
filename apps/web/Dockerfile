# Build context is the repo root (pnpm workspace), not this directory.
# Deploy with: fly deploy --config apps/web/fly.toml   (run from the repo root)
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/schemas/package.json packages/schemas/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY packages/schemas packages/schemas
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter web run prepare

# api's schema:print script (needed for codegen) hardcodes --env-file=.env,
# so it needs a file on disk. Values are dummy - printing the schema never
# opens a database connection.
RUN printf 'DATABASE_URL=postgres://user:pass@localhost:5432/db\nPORT=4000\nCLIENT_ORIGIN=http://localhost:3000\nNODE_ENV=production\n' > apps/api/.env

# Baked into the client bundle at build time - point this at the deployed api.
ARG VITE_GRAPHQL_URL
ENV VITE_GRAPHQL_URL=${VITE_GRAPHQL_URL}

RUN pnpm exec turbo run build --filter=web

FROM base AS runner
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/web/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
