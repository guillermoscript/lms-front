# Environment Variables Reference

> **Never commit `.env.local` to version control.** Copy `.env.example` to `.env.local` and fill in your values.

## Build-time vs Runtime

| Prefix | Available at | Notes |
|--------|-------------|-------|
| `NEXT_PUBLIC_*` | Build time + Runtime (client & server) | Inlined into the JS bundle at build. Changing them requires a rebuild. |
| No prefix | Runtime only (server-side) | Available in server components, API routes, server actions, and middleware. Never exposed to the browser. |

---

## 1. Supabase

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Required** | Supabase project API URL. Used everywhere (client, server, proxy, admin). | Supabase Dashboard > Project Settings > API > Project URL | `https://abcdefghij.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` | **Required** | Supabase anon/publishable key. Safe for client-side. Used by `createClient()` in both client and server. | Supabase Dashboard > Project Settings > API > Project API keys > `anon` `public` | `eyJhbGciOi...` (JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** | Service-role key that **bypasses RLS**. Used by `createAdminClient()`, proxy middleware, webhooks, and scripts. Keep secret. | Supabase Dashboard > Project Settings > API > Project API keys > `service_role` | `eyJhbGciOi...` (JWT) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Optional | Legacy alias referenced in `lib/supabase/middleware.ts`. If set, used by the Supabase middleware client. Typically same value as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`. | Same as anon key above | `eyJhbGciOi...` (JWT) |

**Local Supabase:** For local development with `supabase start`, use:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```
The anon and service-role keys are printed by `supabase start`.

---

## 2. Stripe -- Student Payments (Connect)

These power the student-to-school payment flow via Stripe Connect. Schools receive payments through their connected Stripe accounts.

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `STRIPE_SECRET_KEY` | **Required** (if using Stripe) | Stripe secret API key. Used server-side to create PaymentIntents, manage Connect accounts, etc. | Stripe Dashboard > Developers > API Keys > Secret key | `sk_live_51Abc...` or `sk_test_51Abc...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **Required** (if using Stripe) | Stripe publishable key. Used client-side by Stripe.js / Elements for payment forms. | Stripe Dashboard > Developers > API Keys > Publishable key | `pk_live_51Abc...` or `pk_test_51Abc...` |
| `STRIPE_WEBHOOK_SECRET` | **Required** (if using Stripe) | Signing secret for the `/api/stripe/webhook` endpoint. Verifies incoming webhooks for `payment_intent.succeeded`, `charge.refunded`, `payout.paid`. | Stripe Dashboard > Developers > Webhooks > Select endpoint > Signing secret | `whsec_abc123...` |

---

## 3. Stripe -- Platform Billing

These power the school-to-platform subscription flow. Schools pay the platform for their plan (Starter, Pro, Business, Enterprise) using Stripe Billing (Checkout + Subscriptions).

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `STRIPE_PLATFORM_WEBHOOK_SECRET` | **Required** (if platform billing enabled) | Signing secret for the `/api/stripe/platform-webhook` endpoint. Handles `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_succeeded/failed`. | Stripe Dashboard > Developers > Webhooks > Select platform endpoint > Signing secret | `whsec_xyz789...` |

> **Note:** `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are shared between both Stripe integrations (Connect and Billing). They come from the same Stripe account.

---

## 4. Platform Config

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `NEXT_PUBLIC_PLATFORM_DOMAIN` | **Required** | Root domain for subdomain-based multi-tenant routing. Each school gets `school-slug.<domain>`. Used in proxy middleware, tenant switcher, school creation form, and powered-by banner. | Your DNS provider -- the domain you deploy to | `lmsplatform.com` |
| `NEXT_PUBLIC_APP_URL` | Recommended | Full base URL of the application. Used in emails, certificate verification links, webhook callbacks, and Open Graph metadata. | Derived from your domain | `https://lmsplatform.com` |
| `NEXT_PUBLIC_APP_NAME` | Optional | Display name of the platform. Used as fallback in certificate templates. | Choose your own | `LMS Academy` |

**Local development:**
```
NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000
NEXT_PUBLIC_APP_URL=http://lvh.me:3000
```
(`lvh.me` resolves all subdomains to `127.0.0.1`.)

---

## 5. Other

### Email (Mailgun)

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `MAILGUN_API_KEY` | Optional | Mailgun API key for sending transactional emails (enrollment confirmations, certificate delivery, welcome emails). If unset, email sending is silently skipped. | Mailgun Dashboard > API Keys | `key-abc123def456...` |
| `MAILGUN_DOMAIN` | Optional | Mailgun sending domain. | Mailgun Dashboard > Sending > Domains | `mg.yourdomain.com` |
| `MAILGUN_API_URL` | Optional | Mailgun API base URL. Use `https://api.eu.mailgun.net` for EU region. Defaults to `https://api.mailgun.net`. | Mailgun docs (based on your region) | `https://api.mailgun.net` |
| `EMAIL_FROM` | Optional | Sender address for outgoing emails. Defaults to `noreply@<MAILGUN_DOMAIN>`. | Choose your own | `noreply@yourdomain.com` |

### AI / OpenAI

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `OPENAI_API_KEY` | Optional | OpenAI API key for AI-powered features (exam grading, exercise generation, AI tutor). Server-side only. | OpenAI Platform > API Keys | `sk-proj-abc123...` |

### Certificates

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `CERTIFICATE_ENCRYPTION_KEY` | Optional | Secret key used to sign and verify certificate verification codes. Should be a random 32+ character string. | Generate with `openssl rand -hex 32` | `a1b2c3d4e5f6...` (64 hex chars) |
| `CERTIFICATE_ISSUER_NAME` | Optional | Default issuer name on certificates. Falls back to `LMS Academy`. | Choose your own | `Your Platform Name` |

### Company Info (Invoices / Emails)

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `COMPANY_NAME` | Optional | Company name shown on invoices. Defaults to `LMS Platform`. | Your business info | `Acme Education Inc.` |
| `COMPANY_ADDRESS` | Optional | Company address for invoices. | Your business info | `123 Main St, City, Country` |
| `COMPANY_EMAIL` | Optional | Contact email on invoices. | Your business info | `hello@yourdomain.com` |
| `COMPANY_PHONE` | Optional | Contact phone on invoices. | Your business info | `+1 555 000 0000` |

### Cron Jobs

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `CRON_SECRET` | Optional | Shared secret to authenticate `/api/cron/*` endpoints (e.g., expire-subscriptions). If set, cron requests must include this as a bearer token. | Generate with `openssl rand -hex 32` | `a1b2c3d4...` (64 hex chars) |

### PayPal (Alternative Payment Provider)

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `PAYPAL_CLIENT_ID` | Optional | PayPal REST API client ID. Only needed if `PAYMENT_PROVIDER=paypal`. | PayPal Developer Dashboard > My Apps & Credentials | `AaBbCcDd...` |
| `PAYPAL_CLIENT_SECRET` | Optional | PayPal REST API secret. Only needed if `PAYMENT_PROVIDER=paypal`. | PayPal Developer Dashboard > My Apps & Credentials | `EeFfGgHh...` |
| `PAYMENT_PROVIDER` | Optional | Active payment provider. Defaults to `stripe`. | Set manually | `stripe`, `paypal`, or `manual` |

### MCP Server (AI Development Tooling)

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `MCP_SERVER_URL` | Optional | URL of the MCP HTTP server. Defaults to `http://127.0.0.1:3001`. | Your MCP server deployment | `http://127.0.0.1:3001` |
| `MCP_PROXY_SECRET` | Optional | Shared secret for authenticating MCP proxy requests. | Generate your own | `your-secret-here` |

### CORS

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `ALLOWED_ORIGIN` | Optional | Restrict API/MCP CORS to a specific origin. Defaults to `*` (all origins). | Your domain | `https://yourdomain.com` |

### Testing / CI

These are only used in test or CI contexts and are not needed for production.

| Variable | Required | Description | Where to get it | Example |
|----------|----------|-------------|-----------------|---------|
| `BASE_URL` | Optional | Base URL for Playwright E2E tests. Defaults to `http://localhost:3000`. | Set in CI config | `http://localhost:3000` |
| `CI` | Optional | Set automatically by CI providers. Affects Playwright parallelism, retries, and reporter config. | Set by CI (GitHub Actions, etc.) | `true` |
| `DATABASE_URL` | Optional | Direct Postgres connection string for demo seed scripts. | Supabase Dashboard > Project Settings > Database > Connection string | `postgresql://postgres:password@db.xxx.supabase.co:5432/postgres` |
| `TEST_EMAIL` | Optional | Override email for student acceptance test flows. | Set manually | `playwright.student@example.com` |
| `TEST_PASSWORD` | Optional | Override password for student acceptance test flows. | Set manually | `Password123!` |
| `TEST_ADMIN_EMAIL` | Optional | Override email for admin dashboard tests. | Set manually | `admin@test.com` |
| `TEST_ADMIN_PASSWORD` | Optional | Override password for admin dashboard tests. | Set manually | `testpassword123` |
| `DEMO_RES` | Optional | Resolution for demo recording scripts (`1080` or omit for 720p). | Set manually | `1080` |

---

## Quick Start (Minimum Required)

For a working local development setup, you need at minimum:

```bash
# Supabase (from `supabase start` output)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Platform domain (lvh.me resolves *.lvh.me to 127.0.0.1)
NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000
```

For production with Stripe payments, add:

```bash
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PLATFORM_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```
