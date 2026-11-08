# Background worker: pusher + ingest in one process. Built from the repo root
# (npm workspaces). Railway: RAILWAY_DOCKERFILE_PATH=apps/worker/Dockerfile.
FROM node:22-slim

# OpenSSL for Prisma's query engine (slim images omit it).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .
RUN npm ci
RUN npm run db:generate
RUN npm run build -w apps/worker

# Plain node, no npm wrapper and no TypeScript compiler in memory.
ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
