# BudTube — self-contained 420-friendly gaming video platform.
# Build:  docker build -t budtube .
# Run:    docker run -d -p 3420:3420 -v /path/to/appdata:/data \
#           -e ADMIN_PASSWORD=change-me -e SESSION_SECRET=change-me-too budtube

FROM node:20-slim AS builder
# openssl is required for Prisma to detect the right query engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
# When building behind a TLS-intercepting (corporate) proxy, pass its CA:
#   docker build --secret id=extra_ca,src=/path/to/ca.pem ...
# Without the secret, the env var points at a missing file and is ignored.
ENV NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=secret,id=extra_ca npm ci --no-audit --no-fund
COPY . .
ENV BUILD_STANDALONE=1
ENV DATABASE_URL=file:/data/budtube.db
RUN --mount=type=secret,id=extra_ca npx prisma generate && npm run build

FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3420 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/budtube.db \
    UPLOAD_DIR=/data/uploads

# Standalone server (includes the pruned node_modules Next traced)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma schema + CLI + engines so the entrypoint can `db push` at boot
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Used by docker/create-admin.mjs (Next bundles it, so it's not in standalone)
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

COPY docker/create-admin.mjs ./docker/create-admin.mjs
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3420
VOLUME /data

ENTRYPOINT ["./entrypoint.sh"]
