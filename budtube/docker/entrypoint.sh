#!/bin/sh
set -e

mkdir -p /data/uploads/videos /data/uploads/thumbnails

echo "[budtube] syncing database schema…"
node node_modules/prisma/build/index.js db push \
  --schema=./prisma/schema.prisma --skip-generate

if [ -n "$ADMIN_PASSWORD" ]; then
  echo "[budtube] ensuring owner account…"
  node docker/create-admin.mjs
else
  echo "[budtube] ADMIN_PASSWORD not set — skipping owner account setup"
fi

echo "[budtube] starting server on port ${PORT:-3420}"
exec node server.js
