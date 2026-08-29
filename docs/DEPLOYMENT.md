# Deployment Guide: Dokploy + Multi-Tenant Subdomains

Self-host the LMS on [Dokploy](https://dokploy.com) (open-source PaaS built on Docker + Traefik) with wildcard subdomain routing for multi-tenancy.

## Prerequisites

- VPS/dedicated server (Ubuntu 22.04+, 4GB RAM min with Supabase Cloud, 8GB+ if self-hosting Supabase)
- Domain name (e.g., `lmsplatform.com`)
- Cloudflare account (free tier) for DNS + wildcard SSL
- Dokploy installed on the server

---

## 1. Server & Dokploy Setup

### 1.1 Install Dokploy

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Access the dashboard at `http://your-server-ip:3000`.

### 1.2 DNS Configuration (Cloudflare)

We recommend **Cloudflare** (free tier) for DNS because Traefik's wildcard SSL requires DNS-01 challenge, and Cloudflare has first-class integration. If you're currently on GoDaddy or another registrar, migrate your nameservers to Cloudflare:

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Add your domain** — Cloudflare will scan existing DNS records
3. Cloudflare gives you two nameservers (e.g., `karina.ns.cloudflare.com`, `karl.ns.cloudflare.com`)
4. **Update nameservers at your registrar** (e.g., GoDaddy > My Domains > DNS > Nameservers > Custom) to point to Cloudflare's nameservers
5. Wait for propagation (usually 5-30 minutes)

Once active, configure these DNS records:

| Type  | Name | Value            | Proxy               |
|-------|------|------------------|----------------------|
| A     | `@`  | `your-server-ip` | **DNS only (grey)**  |
| A     | `*`  | `your-server-ip` | **DNS only (grey)**  |
| CNAME | `www`| `lmsplatform.com`| DNS only (grey)      |

**Critical:** Both `@` and `*` records MUST be **DNS only (grey cloud)** so Traefik handles SSL directly. If proxied through Cloudflare, the wildcard cert won't work with Traefik's DNS challenge. You can enable Cloudflare proxy on the `@` record later once everything is working.

**Clean up old records:** If you migrated from another provider, delete any leftover A records pointing to old IPs (e.g., GoDaddy forwarding IPs). You should have exactly ONE A record per name.

### 1.3 Cloudflare API Token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **"Create Token"**
3. Use the **"Edit zone DNS"** template
4. Zone Resources: **Include > Specific zone > your domain**
5. Click **Continue to summary > Create Token**
6. **Copy and save the token** — you'll need it for Traefik configuration

> **Security:** Never share this token publicly. If compromised, rotate it immediately from the same page.

---

## 2. Traefik Wildcard SSL

This is what makes multi-tenant subdomains work with HTTPS.

### 2.1 Add Cloudflare Token to Traefik

In Dokploy: **Web Server** (left sidebar) > scroll to **Web Server** section > click **Traefik** button > select **"Modify Environment"** from the dropdown:

```
CF_DNS_API_TOKEN=your-cloudflare-api-token
```

Save the environment.

### 2.2 Add DNS Challenge Resolver

In Dokploy: **Traefik File System** (left sidebar) > open the `traefik.yml` file.

Add a `letsencrypt-wildcard` DNS challenge resolver **alongside** the existing `letsencrypt` HTTP challenge resolver. Your full `traefik.yml` should look like:

```yaml
global:
  sendAnonymousUsage: false
providers:
  swarm:
    exposedByDefault: false
    watch: true
  docker:
    exposedByDefault: false
    watch: true
    network: dokploy-network
  file:
    directory: /etc/dokploy/traefik/dynamic
    watch: true
entryPoints:
  web:
    address: :80
  websecure:
    address: :443
    http3:
      advertisedPort: 443
    http:
      tls:
        certResolver: letsencrypt
api:
  insecure: true
certificatesResolvers:
  letsencrypt:
    acme:
      email: you@yourdomain.com
      storage: /etc/dokploy/traefik/dynamic/acme.json
      httpChallenge:
        entryPoint: web
  letsencrypt-wildcard:
    acme:
      email: you@yourdomain.com
      storage: /etc/dokploy/traefik/dynamic/acme-wildcard.json
      dnsChallenge:
        provider: cloudflare
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"
```

Save the file, then go back to **Web Server** and click **Traefik > Reload** to apply changes.

> **Note:** The `letsencrypt` resolver (HTTP challenge) is used for the root domain. The `letsencrypt-wildcard` resolver (DNS challenge via Cloudflare) is used for `*.yourdomain.com`. Both coexist.

---

## 3. Deploy the Next.js App

### 3.1 Docker Build

The repo includes a production `Dockerfile` and `.dockerignore`. The Next.js config uses `output: 'standalone'` for self-contained Docker builds.

### 3.2 Create the App in Dokploy

1. **Projects > New Project** > name it "LMS"
2. **Add Service > Application**
3. Source: **Git** (connect your GitHub repo)
4. Build type: **Dockerfile**
5. Dockerfile path: `./Dockerfile`

### 3.3 Environment Variables

In Dokploy app settings > **Environment**:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Platform Domain (no protocol, no trailing slash)
NEXT_PUBLIC_PLATFORM_DOMAIN=lmsplatform.com
NEXT_PUBLIC_APP_URL=https://lmsplatform.com

# Stripe — Student Payments (Connect)
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Platform Billing (school pays the platform) — one section per rail.
# Only the rails you actually price in Platform → Plans need to be set.
STRIPE_PLATFORM_WEBHOOK_SECRET=whsec_...        # Stripe; separate registration from the Connect webhook above
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
# Lemon Squeezy and Binance Pay share one merchant account with the student→school loop;
# the two are kept apart by the platform:<provider> webhook_events namespace — no second account needed.
BINANCE_PAY_API_KEY=
BINANCE_PAY_API_SECRET=
# Solana has no webhook — do not register one. Payments are proven on chain by
# /api/billing/solana/verify, which the school's browser polls.
SOLANA_RPC_URL=
SOLANA_PLATFORM_WALLET=
SOLANA_USDC_MINT=                               # Set = settle in USDC (recommended, no price oracle). Unset = settle in native SOL at the Pyth quote locked at checkout.
# PayPal is coded but its platform-billing checkout is capability-disabled pending #479 —
# no PAYPAL_* needed here; PayPal is still used for student→school payments (configured elsewhere in this file).

# OpenAI (AI grading)
OPENAI_API_KEY=sk-...

# Email (Mailgun)
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=mg.lmsplatform.com
MAILGUN_API_URL=https://api.mailgun.net
EMAIL_FROM=noreply@lmsplatform.com

# Certificates
CERTIFICATE_ENCRYPTION_KEY=your-32-char-key
CERTIFICATE_ISSUER_NAME=Your Platform Name

# Company
COMPANY_NAME=Your Company
COMPANY_EMAIL=hello@lmsplatform.com

# Cron
CRON_SECRET=your-random-secret-here
```

### 3.4 Configure Domains

In the app's **Domains** tab:

**Domain 1 — Platform root:**

In the app's **Domains** tab, click **Add Domain**:
- Host: `lmsplatform.com`
- Port: `3000`
- HTTPS: Yes
- Certificate Provider: `Let's Encrypt` (standard HTTP challenge)

**Domain 2 — Wildcard subdomains:**

> **Important:** Do NOT add `*.lmsplatform.com` as a regular domain in Dokploy — Traefik does not support literal `*` in `Host()` rules and will error with: `"*.lmsplatform.com" is not a valid hostname`. You must use `HostRegexp` via the Advanced config.

In the app's **Advanced** tab, find the Traefik dynamic configuration. You'll see the existing router config for your root domain. Add wildcard routers alongside it.

Here's what the full Advanced config should look like (replace `YOUR-SERVICE-NAME` with the Dokploy-generated service name visible in the existing config, and `YOUR-APP-CONTAINER` with the container hostname):

```yaml
http:
  routers:
    # --- Root domain (auto-generated by Dokploy) ---
    your-app-router:
      rule: Host(`lmsplatform.com`)
      service: YOUR-SERVICE-NAME
      middlewares:
        - redirect-to-https
      entryPoints:
        - web
    your-app-router-websecure:
      rule: Host(`lmsplatform.com`)
      service: YOUR-SERVICE-NAME
      middlewares: []
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt

    # --- Wildcard subdomains (add these manually) ---
    lms-wildcard:
      rule: HostRegexp(`^[a-z0-9-]+\.lmsplatform\.com$`)
      service: YOUR-SERVICE-NAME
      middlewares:
        - redirect-to-https
      entryPoints:
        - web
    lms-wildcard-secure:
      rule: HostRegexp(`^[a-z0-9-]+\.lmsplatform\.com$`)
      service: YOUR-SERVICE-NAME
      middlewares: []
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt-wildcard
        domains:
          - main: lmsplatform.com
            sans:
              - "*.lmsplatform.com"

  services:
    YOUR-SERVICE-NAME:
      loadBalancer:
        servers:
          - url: http://YOUR-APP-CONTAINER:3000
        passHostHeader: true
```

**How to find `YOUR-SERVICE-NAME` and `YOUR-APP-CONTAINER`:** Look at the existing config in the Advanced tab — Dokploy auto-generates these when you add the root domain. They follow the pattern `project-name-hash-service-N` (e.g., `guille-personal-lms-lj9e61-service-15`).

After saving, **redeploy** the app. Allow 1-2 minutes for Let's Encrypt to issue the wildcard certificate via DNS challenge.

### 3.5 Cron Jobs

`vercel.json` declares these schedules, but **Dokploy does not read `vercel.json`** —
something on this side has to call the routes or they never run at all. Every
`/api/cron/*` route authenticates with `Authorization: Bearer $CRON_SECRET`
(§3.3), so any scheduler that can issue an HTTP GET will do.

**Pick exactly one of the three mechanisms below.** Running two means every route
fires twice; the routes are written to tolerate that, but it doubles the load and
makes logs hard to read.

#### Option A — GitHub Actions (default, and what the repo ships)

`.github/workflows/cron.yml` runs all declared schedules. It needs two repository
settings under **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret | `CRON_SECRET` | Same value as the `CRON_SECRET` env var on the Dokploy app |
| Variable | `CRON_BASE_URL` | Production origin, e.g. `https://lmsplatform.com` |

A missing setting fails the run loudly rather than silently no-opping. Verify it
end to end with a manual run:

```bash
gh workflow run cron.yml -f route=enforce-plan-limits
gh run watch
```

Two caveats: GitHub delays scheduled runs under load (dropping high-frequency
ones first, so the `*/10` reconcilers are the most affected), and it disables
scheduled workflows after 60 days with no repository activity. If either matters
for your deployment, use Option B instead.

#### Option B — Dokploy scheduled task

In the Dokploy dashboard, open the LMS application → **Schedules** → create one
per line below, shell `bash`, command:

```bash
curl -sS -f -H "Authorization: Bearer $CRON_SECRET" https://lmsplatform.com/api/cron/<route>
```

Most reliable of the three (it runs on the host, on time), but it is invisible to
the repository — nothing in code review will tell you it exists or that it broke.
If you choose this, disable the schedules in `.github/workflows/cron.yml`.

#### Option C — host crontab

```bash
# crontab -e
# Expire lapsed student subscriptions
0 0 * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://lmsplatform.com/api/cron/expire-subscriptions
# Daily digest + streak nudge — must run HOURLY (each tenant sends at its own local hour)
0 * * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://lmsplatform.com/api/cron/daily-digest
# Weekly league rollover (Mondays 01:00). pg_cron inside the database also runs it (Mondays 00:05), so this entry is a fallback.
0 1 * * 1 curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://lmsplatform.com/api/cron/league-rollover
# Expire lapsed manual-transfer platform (school billing) subscriptions: reminders, grace, downgrade to free. Replaces the retired pg_cron job.
0 2 * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://lmsplatform.com/api/cron/expire-platform-subscriptions
# Reconcile access cutoffs for tenants that grew past their plan limits with no plan-change event
0 3 * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://lmsplatform.com/api/cron/enforce-plan-limits
# Confirm on-chain Solana payments
*/10 * * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://lmsplatform.com/api/cron/solana-reconcile
# Confirm Binance personal-wallet payments
*/10 * * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://lmsplatform.com/api/cron/binance-personal-reconcile
# Replay stalled signed webhook deliveries
*/10 * * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://lmsplatform.com/api/cron/redeliver-webhook-events
# Retry paid Solana platform requests whose entitlement activation stalled
*/10 * * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://lmsplatform.com/api/cron/reconcile-solana-platform-activations
```

> `/api/cron/solana-pull` exists but is deliberately not on any schedule here or
> in `vercel.json`. It submits on-chain USDC transfers for native Solana
> subscriptions; enabling it is a separate decision. Run it manually via
> `gh workflow run cron.yml -f route=solana-pull` if needed.

---

## 4. How Subdomain Routing Works

Request flow for `school.lmsplatform.com`:

1. **DNS**: Wildcard `*.lmsplatform.com` resolves to your server IP
2. **Traefik**: Matches the `HostRegexp` rule, routes to the Next.js container
3. **proxy.ts**: Extracts `school` from `Host` header, queries `tenants` table, sets `x-tenant-id` header
4. **App**: Components read `x-tenant-id` and filter queries by `tenant_id`

`NEXT_PUBLIC_PLATFORM_DOMAIN` tells `proxy.ts` what the root domain is:
- `lmsplatform.com` → platform root (no tenant)
- `school.lmsplatform.com` → tenant "school"

No code changes are needed — `proxy.ts` already handles this.

---

## 5A. Supabase Cloud (Recommended)

1. Create project at [supabase.com](https://supabase.com)
2. Push migrations:
   ```bash
   supabase link --project-ref YOUR_REF
   supabase db push
   ```
3. Configure Auth:
   - Site URL: `https://lmsplatform.com`
   - Redirect URLs: `https://lmsplatform.com/**`, `https://*.lmsplatform.com/**`
   - Enable the `custom_access_token_hook` function under Authentication > Hooks
4. Configure Storage buckets as needed
5. Copy API keys to Dokploy env vars

**Pros:** Zero maintenance, automatic backups, managed Auth/Realtime/Storage.
**Cons:** Monthly cost (~$25/mo Pro plan), data on Supabase infrastructure.

---

## 5B. Self-Hosted Supabase (Same Server)

Requires **8GB+ RAM** (Supabase alone needs ~3-4GB).

### Option A — Dokploy Template (Easiest)

1. In Dokploy: **Projects > Add Service > Compose > Templates**
2. Select **Supabase** template (requires Dokploy v0.22.5+)
3. Configure environment variables
4. Set domain for Studio (e.g., `supabase.lmsplatform.com`)
5. Deploy

### Option B — Manual Docker Compose

1. Clone: `git clone https://github.com/supabase/supabase --depth 1`
2. Copy `docker/docker-compose.yml` and `.env.example`
3. Create as a Compose service in Dokploy
4. Configure all env vars

### Self-Hosted Environment

```env
POSTGRES_PASSWORD=your-strong-password
JWT_SECRET=your-jwt-secret-min-32-chars
ANON_KEY=generate-with-supabase-cli
SERVICE_ROLE_KEY=generate-with-supabase-cli
SITE_URL=https://lmsplatform.com
ADDITIONAL_REDIRECT_URLS=https://*.lmsplatform.com/**
API_EXTERNAL_URL=https://api.lmsplatform.com
SUPABASE_PUBLIC_URL=https://api.lmsplatform.com

# SMTP
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.lmsplatform.com
SMTP_PASS=your-mailgun-smtp-password
SMTP_ADMIN_EMAIL=admin@lmsplatform.com
SMTP_SENDER_NAME=LMS Platform
```

### Domains for Self-Hosted Supabase

| Subdomain                  | Service               | Port |
|----------------------------|-----------------------|------|
| `api.lmsplatform.com`      | Supabase Kong gateway | 8000 |
| `supabase.lmsplatform.com` | Supabase Studio       | 3000 |

### Connect Next.js to Self-Hosted Supabase

```env
NEXT_PUBLIC_SUPABASE_URL=https://api.lmsplatform.com
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-generated-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-generated-service-role-key
```

### Apply Migrations

```bash
supabase db push --db-url postgresql://postgres:YOUR_PASSWORD@your-server-ip:5432/postgres
```

### Enable Custom Access Token Hook

The LMS relies on `custom_access_token_hook()` for JWT claims:

1. Apply all migrations (the hook function is included)
2. In Supabase Studio > Authentication > Hooks: enable the custom access token hook pointing to `public.custom_access_token_hook`

**Pros:** Full control, data on your server, lower latency, no Supabase bill.
**Cons:** You manage backups/updates/security, more RAM needed, no auto-scaling.

---

## 6. Payment Webhook Configuration

Register one endpoint per provider per money loop. Stripe is the only provider
needing two registrations — the others sign both loops with a single secret, and
the two loops are kept apart by the `platform:<provider>` `webhook_events`
namespace rather than by separate credentials.

Both of these are in the Stripe Dashboard:

**Student Payments (Connect):**
- URL: `https://lmsplatform.com/api/stripe/webhook`
- Events: `payment_intent.succeeded`, `charge.refunded`, `payout.paid`
- Signing secret → `STRIPE_WEBHOOK_SECRET`

**Platform Billing:**
- URL: `https://lmsplatform.com/api/billing/webhook/stripe`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- Signing secret → `STRIPE_PLATFORM_WEBHOOK_SECRET`

> **Upgrading an existing deployment (#603):** this endpoint moved from
> `/api/stripe/platform-webhook` to `/api/billing/webhook/stripe`. **Edit the URL on
> the existing Stripe endpoint rather than creating a new one** — that keeps the
> signing secret, so `STRIPE_PLATFORM_WEBHOOK_SECRET` needs no change. Until the URL
> is repointed, Stripe posts to a path that no longer exists: plan activations,
> renewals and dunning all stop silently, because a school's payment succeeds at
> Stripe and only our side of it goes missing. The old path is deleted outright — no
> forwarder — so a 404 in the Stripe dashboard's delivery log is the symptom.
>
> The path is provider-shaped (`/api/billing/webhook/<provider>`), so a second
> platform-billing rail (Lemon Squeezy, PayPal) is registered the same way at its own
> slug and needs no new code.

**Binance Pay (platform billing, #610):**
- URL: `https://lmsplatform.com/api/billing/webhook/binance`
- Register it in the Binance Pay merchant dashboard against the SAME merchant account
  `BINANCE_PAY_API_KEY` / `BINANCE_PAY_API_SECRET` point at — platform billing and
  student payments share it, and the two loops are kept apart by the
  `platform:binance` namespace on `webhook_events`, not by separate credentials.
- Verification uses Binance's published certificate, so there is no signing secret to
  set for this endpoint.

**Solana (platform billing, #610):** no webhook exists and none should be registered.
Payments are proven on chain by `/api/billing/solana/verify`, which the school's own
browser polls. It needs `SOLANA_RPC_URL` and `SOLANA_PLATFORM_WALLET`; set
`SOLANA_USDC_MINT` to settle in USDC (recommended — a 1:1 USD stablecoin needs no
price oracle) and leave it unset to settle in native SOL at the Pyth quote locked at
checkout.

### Going live with the crypto rails — checklist

Merged in #611 and applied to the cloud database, but **dormant**: the code shipped,
the schema shipped, and nothing is reachable by any school. The payment-method dialog
lists a rail only when `platform_plan_prices` has an active row for that plan,
interval AND provider, so a rail with no rows simply does not exist as far as the UI
is concerned. That is the on/off switch — there is no feature flag to find.

The two rails are independent. Turning one on does not require the other.

**Binance Pay — needs a merchant account.** Without one, add no `binance` price rows
and there is nothing else to do or undo. When you have one:

1. Set `BINANCE_PAY_API_KEY` / `BINANCE_PAY_API_SECRET` (merchant dashboard).
2. Register `https://<domain>/api/billing/webhook/binance` there.
3. Add a Binance Pay price row per paid plan and interval under **Platform → Plans →
   Prices**. Leave the provider-price-id field blank (it disables itself — Binance has
   no catalog) and set the amount.
4. Buy the cheapest plan from a school account and let it settle. Renewal is a second
   purchase, not an automatic charge — Binance has no recurring billing, so the expiry
   cron owns the period.

**Solana — needs only a wallet.** No merchant, no account, no approval:

1. Hold a **mainnet** keypair for `SOLANA_PLATFORM_WALLET`. The devnet address in a
   `.env.local` works on mainnet too — the same address exists on both networks — but
   only if you still have its private key. If it was a throwaway, generate a new one.
   Every school's plan payment lands here in full; there is no split.
2. `SOLANA_RPC_URL` — the public `api.mainnet-beta.solana.com` will rate-limit a real
   funnel. A Helius/QuickNode free tier is enough.
3. `SOLANA_USDC_MINT` — mainnet USDC is `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
   **Verify it against an official source before pasting**; paying to the wrong mint is
   unrecoverable and there is no refund path on this rail. Leaving it unset settles in
   native SOL at the Pyth quote locked at checkout — it works, but it puts a price
   oracle in the money path for no benefit.
4. Add a Solana price row per paid plan and interval, same as step 3 above.
5. Pay the cheapest plan yourself, once, from a real wallet. **The on-chain transfer is
   the only part of this flow that has never run** — everything up to it (intent row,
   settlement lock, transaction building, polling, activation) is covered by tests, and
   the transfer itself is not.

**Reverting** is deactivating the price rows (the toggle in the prices editor), not a
deploy. A school mid-payment keeps its pending request; the QR it already holds still
settles, because `/api/billing/solana/tx` reads the request, not the price table.

---

## 7. Verification Checklist

After deployment, verify:

- [ ] `https://lmsplatform.com` loads the platform homepage
- [ ] `https://school.lmsplatform.com` loads a tenant (after creating one)
- [ ] SSL works on both root and wildcard subdomains (padlock icon)
- [ ] Login/signup works (Supabase Auth)
- [ ] Creating a new school gives it a subdomain that resolves
- [ ] Stripe webhooks receive test events (`stripe trigger payment_intent.succeeded`)
- [ ] Cron job runs daily (`/api/cron/expire-subscriptions`)
- [ ] Email sending works (test signup confirmation)

---

## 8. Troubleshooting

### Wildcard subdomain returns 404

**Symptom:** `school.lmsplatform.com` returns a Traefik 404 page, but `lmsplatform.com` works.

**Causes and fixes:**

1. **Missing wildcard router:** Check that the `lms-wildcard` and `lms-wildcard-secure` routers exist in the Advanced config. Dokploy's regular domain UI does not support wildcards.

2. **Traefik error `"*.domain.com" is not a valid hostname`:** You added `*.domain.com` as a regular domain in Dokploy's Domains tab. Delete it — wildcards must use `HostRegexp` in the Advanced config.

3. **DNS not resolving:** Run `dig +short school.lmsplatform.com` — it should return your server IP. If not, check that the `*` A record exists in Cloudflare and nameservers have propagated.

4. **Wildcard cert not issued:** Check Traefik logs (**Web Server > Traefik > View Logs**) for ACME errors. Common causes:
   - `CF_DNS_API_TOKEN` not set in Traefik environment
   - Cloudflare API token doesn't have `DNS:Edit` permission on the correct zone
   - `letsencrypt-wildcard` resolver not defined in `traefik.yml`
   - `acme-wildcard.json` storage path conflict — ensure it's different from the HTTP challenge storage

5. **Cloudflare proxy (orange cloud) enabled on wildcard:** The `*` A record must be **DNS only (grey cloud)**. Cloudflare proxy intercepts TLS and breaks Traefik's DNS challenge.

### Tenant not created after onboarding

**Symptom:** User completes the create-school flow but the subdomain shows "Invalid tenant."

**Cause:** The `create_school` RPC requires an authenticated user (`auth.uid()` must not be null). If the user's session expired or cookies weren't sent, the RPC fails silently on the client.

**Fix:** Check the browser console for RPC errors. The user should log in again and retry the create-school flow. Alternatively, create the tenant manually via SQL:

```sql
-- Create tenant
INSERT INTO tenants (name, slug, status)
VALUES ('School Name', 'school-slug', 'active')
RETURNING id;

-- Add admin user (replace UUIDs)
INSERT INTO tenant_users (tenant_id, user_id, role, status)
VALUES ('tenant-uuid-from-above', 'user-uuid', 'admin', 'active');
```

### SSL certificate not renewing

Traefik auto-renews Let's Encrypt certificates. If renewal fails:

1. Check Traefik logs for ACME errors
2. Verify the Cloudflare API token hasn't been revoked
3. Ensure the `acme-wildcard.json` file is writable
4. Try deleting the `acme-wildcard.json` file and reloading Traefik to force re-issuance

---

## Recommendation

**Start with Supabase Cloud** to avoid managing Postgres backups, Auth configuration, and the custom access token hook. Migrate to self-hosted later once traffic justifies it.

The critical work is in **Sections 2-3**: getting Traefik wildcard SSL + DNS challenge working. Once that's done, subdomain routing works automatically via `proxy.ts`.

---

## References

- [Dokploy Domains Documentation](https://docs.dokploy.com/docs/core/domains)
- [Wildcard SSL in Dokploy — naps62](https://www.naps62.com/posts/wildcard-ssl-in-dokploy)
- [Dokploy Wildcard Subdomain Discussion #3089](https://github.com/Dokploy/dokploy/discussions/3089)
- [Traefik DNS Challenge Providers](https://doc.traefik.io/traefik/https/acme/#providers)
- [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
