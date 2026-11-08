# Dashboard (Next.js 16). Built from the repo root so npm workspaces resolve.
# Railway: set RAILWAY_DOCKERFILE_PATH=apps/dashboard/Dockerfile on the service.
FROM node:22

WORKDIR /app

# Install all workspace deps (dev deps needed to build Next + Tailwind + Prisma).
COPY . .
RUN npm ci

# Generate the Prisma client and build the app.
RUN npm run db:generate
RUN npm run build -w apps/dashboard

# Runtime: production mode (secure cookies, etc). Railway injects PORT.
# Run Next directly: an `npm run start` wrapper is a second Node process that
# sits in memory doing nothing. Next reads PORT from the environment.
ENV NODE_ENV=production
WORKDIR /app/apps/dashboard
CMD ["node", "../../node_modules/next/dist/bin/next", "start"]
