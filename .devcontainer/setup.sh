#!/usr/bin/env bash
# Provisions a GitHub Codespace (or any devcontainer) for lms-front.
# Runs once via postCreateCommand. Safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ [1/4] Installing system libraries for canvas/sharp..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libpixman-1-0

echo "▶ [2/4] Installing Supabase CLI..."
if ! command -v supabase >/dev/null 2>&1; then
  ARCH="$(dpkg --print-architecture)" # amd64 | arm64
  curl -fsSL "https://github.com/supabase/cli/releases/latest/download/supabase_linux_${ARCH}.tar.gz" -o /tmp/supabase.tar.gz
  tar -xzf /tmp/supabase.tar.gz -C /tmp
  sudo install /tmp/supabase /usr/local/bin/supabase
  rm -f /tmp/supabase.tar.gz /tmp/supabase
fi
supabase --version

echo "▶ [3/4] Installing npm dependencies..."
# --include=optional so lightningcss/Tailwind v4 native Linux binaries resolve.
npm install --include=optional

echo "▶ [4/4] Scaffolding .env.local..."
if [ ! -f .env.local ]; then
  cp .env.example .env.local

  set_env() {
    local key="$1" val="$2"
    if grep -qE "^${key}=" .env.local; then
      sed -i "s|^${key}=.*|${key}=${val}|" .env.local
    else
      echo "${key}=${val}" >>.env.local
    fi
  }

  # Well-known local Supabase defaults (printed by `supabase start`).
  set_env "NEXT_PUBLIC_SUPABASE_URL" "http://127.0.0.1:54321"
  set_env "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY" \
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"
  set_env "SUPABASE_SERVICE_ROLE_KEY" \
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
  set_env "NEXT_PUBLIC_PLATFORM_DOMAIN" "lvh.me"
  set_env "NEXT_PUBLIC_APP_URL" "http://localhost:3000"

  echo "  Created .env.local with local Supabase defaults."
else
  echo "  .env.local already exists — leaving it untouched."
fi

cat <<'EOF'

✅ Codespace ready.

Next steps:
  1. supabase start          # boot the local Supabase stack (first run pulls images)
  2. npm run db:reset        # apply migrations + seed test data
  3. npm run dev             # start Next.js at http://localhost:3000

If `supabase start` prints anon/service keys that differ from the defaults,
copy them into .env.local.

For E2E tests (installs a browser + system deps, ~1 min):
  npx playwright install --with-deps chromium

Notes:
  • Subdomain tenant routing (school.lvh.me) does not work through the
    forwarded Codespace URL. Use the default tenant, or pass the
    `x-tenant-slug` header in dev to simulate a subdomain.
EOF
