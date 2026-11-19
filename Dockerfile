# syntax=docker/dockerfile:1
# One image for the API (which also serves the built frontend) and the quiz workers.

ARG NODE_VERSION=26
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app
# Prisma's engines need OpenSSL.
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

FROM base AS build
# bcrypt compiles from source when no prebuilt binary matches this Node.
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# Skip the root "prepare" script (git hooks); run only the install scripts the app needs.
RUN npm ci --ignore-scripts && npm rebuild bcrypt prisma @prisma/engines @prisma/client

COPY . .
# The frontend calls the API on this origin; it is baked in at build time.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM base
# Links the ghcr.io package to the repository, so the CI workflow token can push to it.
LABEL org.opencontainers.image.source="https://github.com/gideonoludeyi/quiz-qrafter"
ENV NODE_ENV=production \
    STATIC_DIR=/app/frontend/dist
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8080
# prestart runs `prisma migrate deploy` before the API listens.
CMD ["npm", "run", "start", "--workspace=backend"]
