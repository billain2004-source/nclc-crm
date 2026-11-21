#!/usr/bin/env bash
# One-time developer setup for NCLC CRM (macOS / Linux).
#   ./scripts/setup.sh            # install + create .env
#   ./scripts/setup.sh --init-db  # ...and create + seed the database
# Generates JWT_SECRET and APP_ENC_KEY if empty; never touches DB_PASSWORD (you set it yourself).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v node >/dev/null || { echo "Node.js 18+ is required (https://nodejs.org)"; exit 1; }
MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$MAJOR" -ge 18 ] || { echo "Node.js 18+ is required (found $(node -v))"; exit 1; }

for d in backend frontend; do (cd "$ROOT/$d" && npm ci --no-audit --no-fund); done

secret() { node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"; }
ENV="$ROOT/.env"
[ -f "$ENV" ] || { cp "$ROOT/.env.example" "$ENV"; echo "Created .env from .env.example"; }
grep -qE '^JWT_SECRET=(|change-me.*)$' "$ENV" && sed -i.bak -E "s/^JWT_SECRET=.*/JWT_SECRET=$(secret)/" "$ENV"
if grep -qE '^APP_ENC_KEY=$' "$ENV"; then sed -i.bak -E "s/^APP_ENC_KEY=$/APP_ENC_KEY=$(secret)/" "$ENV";
elif ! grep -qE '^APP_ENC_KEY=' "$ENV"; then echo "APP_ENC_KEY=$(secret)" >> "$ENV"; fi
rm -f "$ENV.bak"

if [ "${1:-}" = "--init-db" ]; then
  (cd "$ROOT/backend" && npm run db:setup)
else
  echo "Next: set DB_USER / DB_PASSWORD in .env, then: (cd backend && npm run db:setup)"
  echo "Run:  (cd backend && npm start) & (cd frontend && npm run dev)"
fi
