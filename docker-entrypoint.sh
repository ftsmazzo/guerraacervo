#!/bin/sh
set -e
echo "[entrypoint] bootstrap (migrate + seed)"
node scripts/bootstrap.mjs
echo "[entrypoint] iniciando Next.js"
exec node server.js
