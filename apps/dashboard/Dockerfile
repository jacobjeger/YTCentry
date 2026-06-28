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
ENV NODE_ENV=production
CMD ["npm", "run", "start", "-w", "apps/dashboard"]
