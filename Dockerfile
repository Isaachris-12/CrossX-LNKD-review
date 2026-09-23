# Builds the backend API and worker into one image (they share the same
# compiled output; only the start command differs - see render.yaml).
# Built from the repo root so npm workspaces resolve @crossx/shared
# correctly; apps/mobile's source isn't needed here, only its package.json
# so `npm ci` can resolve the full workspace lockfile.

FROM node:20-slim AS build
WORKDIR /app

# Prisma's query engine needs OpenSSL to detect the right binary target;
# the slim base image doesn't include it by default.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY server/package.json server/package.json
COPY apps/mobile/package.json apps/mobile/package.json

RUN npm ci

COPY packages/shared packages/shared
COPY server server

RUN npx prisma generate --schema=server/prisma/schema.prisma
RUN npm run build --workspace=server

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/server ./server
COPY package.json package-lock.json ./

WORKDIR /app/server
EXPOSE 4000

# Overridden per-service in render.yaml: the API runs dist/index.js, the
# worker runs dist/worker.js.
CMD ["node", "dist/index.js"]
