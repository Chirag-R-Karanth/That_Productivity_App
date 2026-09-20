# ---- deps + build ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable

# Workspace manifests (pnpm needs them to resolve the dependency graph)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

# Install only backend + its workspace deps
RUN pnpm install --frozen-lockfile --filter=backend...

COPY packages/shared-types packages/shared-types
COPY apps/backend apps/backend

# Generate the Prisma client (not committed to the repo), then compile.
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/productivity
RUN pnpm --filter backend db:generate
RUN pnpm --filter backend build

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app /app

WORKDIR /app/apps/backend
EXPOSE 4000
# Apply pending Prisma migrations, then boot the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]