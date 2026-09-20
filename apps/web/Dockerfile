# ---- deps + build ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable

# NEXT_PUBLIC_API_URL: empty by default → the app talks to the same origin via
# /api/* (reverse-proxied by nginx in docker-compose.prod.yml). Override with a
# build arg when the API lives elsewhere.
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm install --frozen-lockfile --filter=web...

COPY packages/shared-types packages/shared-types
COPY apps/web apps/web

RUN pnpm --filter web build

# ---- runtime (Next standalone output only) ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]