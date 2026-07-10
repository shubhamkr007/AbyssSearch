# syntax=docker/dockerfile:1

# ---- builder ----
FROM node:20-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Install deps against the service's own manifest (standalone build context).
COPY package.json ./
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
RUN pnpm install --no-frozen-lockfile

COPY src ./src
RUN pnpm prisma generate && pnpm build

# ---- runner ----
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://localhost:8000/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Applies pending migrations, then starts the API.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
