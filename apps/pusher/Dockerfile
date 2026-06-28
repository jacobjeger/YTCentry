# Cloud push worker. Built from the repo root (npm workspaces).
# Railway: set RAILWAY_DOCKERFILE_PATH=apps/pusher/Dockerfile on the service.
FROM node:22-slim

WORKDIR /app

# Keep dev deps (tsx runs the TypeScript entrypoint at runtime).
COPY . .
RUN npm ci
RUN npm run db:generate

CMD ["npm", "run", "start", "-w", "apps/pusher"]
