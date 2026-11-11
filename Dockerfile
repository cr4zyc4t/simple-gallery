# syntax=docker/dockerfile:1

###############################################################################
# 1. Dependencies — build toolchain is only needed as a fallback in case no
#    prebuilt binary exists for better-sqlite3 / sharp on this platform.
###############################################################################
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

###############################################################################
# 2. Build
###############################################################################
FROM deps AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

###############################################################################
# 3. Runtime — Next.js standalone server (node_modules are already traced,
#    including the better-sqlite3 and sharp native binaries).
###############################################################################
FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    GALLERY_ROOT=/data/gallery \
    GALLERY_ALLOWED_ROOTS=/data \
    GALLERY_DB_PATH=/data/gallery.db \
    GALLERY_CACHE_DIR=/data/thumbs

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --home /app nextjs \
  && mkdir -p /data/gallery /data/thumbs \
  && chown -R nextjs:nodejs /data /app

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/drizzle ./drizzle

# The build trace copies the sample media folder into the image; the runtime
# reads media from the mounted volume instead, so drop the duplicate.
RUN rm -rf ./media ./data ./tsconfig.tsbuildinfo

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/state').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
