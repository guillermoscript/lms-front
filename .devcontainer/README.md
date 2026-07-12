# GitHub Codespaces / Dev Containers

This folder makes `lms-front` runnable in a [GitHub Codespace](https://github.com/features/codespaces)
(or any Dev Containers–compatible editor) with zero local setup.

## What you get

- **Node 24** on Debian bookworm (matches the production `Dockerfile`)
- **Docker-in-Docker** — required so the local Supabase stack can boot
- **Supabase CLI** installed to `/usr/local/bin`
- Native libs for `canvas` / `sharp` (`libcairo2`, `libpango`, …)
- `npm install` run automatically, plus a pre-filled `.env.local`
- Ports forwarded: `3000` (app), `54321` (API), `54322` (DB), `54323` (Studio),
  `54324` (Inbucket mail), `54327` (Analytics)

## Launch

1. On GitHub: **Code → Codespaces → Create codespace on `<branch>`**.
2. Wait for `postCreateCommand` (`.devcontainer/setup.sh`) to finish provisioning.
3. In the terminal:
   ```bash
   supabase start      # boots Postgres, Studio, etc. (first run pulls images)
   npm run db:reset    # applies migrations + seeds test accounts
   npm run dev         # http://localhost:3000
   ```

## Test accounts (from `supabase/seed.sql`)

| Email | Password | Role |
|---|---|---|
| `student@e2etest.com` | `password123` | Student (Default School) |
| `owner@e2etest.com` | `password123` | Admin (Default School) |
| `creator@codeacademy.com` | `password123` | Teacher (Code Academy) |
| `alice@student.com` | `password123` | Student (Code Academy) |

## Gotchas

- **Supabase keys**: `.env.local` is pre-filled with the standard local demo
  anon/service keys. If `supabase start` prints different keys, copy them in.
- **Subdomain tenants**: `school.lvh.me` routing works only on `localhost`
  inside the container, not through the forwarded `*.app.github.dev` URL. Use
  the default tenant, or send an `x-tenant-slug` header to simulate a subdomain
  in dev.
- **E2E tests**: install a browser first — `npx playwright install --with-deps chromium`.
- **MCP server** (`mcp-server/`): run its own `npm install` and `.env` setup if needed.
