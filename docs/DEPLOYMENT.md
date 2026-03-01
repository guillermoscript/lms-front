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

| Type  | Name | Value            | Proxy               |
|-------|------|------------------|----------------------|
| A     | `@`  | `your-server-ip` | Proxied (orange)     |
| A     | `*`  | `your-server-ip` | **DNS only (grey)**  |
| CNAME | `www`| `lmsplatform.com`| Proxied              |

**Critical:** The wildcard `*` record MUST be **DNS only (grey cloud)** so Traefik handles SSL directly. If proxied through Cloudflare, the wildcard cert won't work with Traefik's DNS challenge.

### 1.3 Cloudflare API Token

1. Cloudflare Dashboard > My Profile > API Tokens
2. Create Token > **Edit zone DNS** template
3. Zone Resources: Include your domain
4. Save the token for Traefik configuration

---

## 2. Traefik Wildcard SSL

This is what makes multi-tenant subdomains work with HTTPS.

### 2.1 Add Cloudflare Token

In Dokploy: **Web Server > Traefik > Environment**

```
CF_DNS_API_TOKEN=your-cloudflare-api-token
```

### 2.2 Add DNS Challenge Resolver

In Dokploy: **Web Server > Traefik > traefik.yml** — add a DNS challenge resolver alongside the existing one:

```yaml
certificatesResolvers:
  letsencrypt:
    # ... existing HTTP challenge config (keep it)
  letsencrypt-dns:
    acme:
      email: you@yourdomain.com
      storage: /etc/dokploy/traefik/dynamic/acme-dns.json
      dnsChallenge:
        provider: cloudflare
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"
```

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

# Stripe — Platform Billing
STRIPE_PLATFORM_WEBHOOK_SECRET=whsec_...

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
- Host: `lmsplatform.com`
- HTTPS: Yes
- Certificate resolver: `letsencrypt` (standard HTTP challenge)

**Domain 2 — Wildcard subdomains:**

In the app's **Advanced > Traefik** section, add custom labels:

```yaml
# HTTP wildcard router
- "traefik.http.routers.lms-wildcard.rule=HostRegexp(`^[a-z0-9-]+\\.lmsplatform\\.com$`)"
- "traefik.http.routers.lms-wildcard.entrypoints=web"
- "traefik.http.routers.lms-wildcard.service=lms-<SERVICE_HASH>-web"
- "traefik.http.routers.lms-wildcard.middlewares=redirect-to-https@docker"

# HTTPS wildcard router
- "traefik.http.routers.lms-wildcard-secure.rule=HostRegexp(`^[a-z0-9-]+\\.lmsplatform\\.com$`)"
- "traefik.http.routers.lms-wildcard-secure.entrypoints=websecure"
- "traefik.http.routers.lms-wildcard-secure.service=lms-<SERVICE_HASH>-web"
- "traefik.http.routers.lms-wildcard-secure.tls.certresolver=letsencrypt-dns"
- "traefik.http.routers.lms-wildcard-secure.tls.domains[0].main=lmsplatform.com"
- "traefik.http.routers.lms-wildcard-secure.tls.domains[0].sans=*.lmsplatform.com"
```

Replace `<SERVICE_HASH>` with the Dokploy-generated service name (visible in the Traefik dashboard or via `docker inspect`).

### 3.5 Cron Jobs

Since there's no Vercel cron, set up a system cron on the server:

```bash
# crontab -e
0 0 * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://lmsplatform.com/api/cron/expire-subscriptions
```

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

## 6. Stripe Webhook Configuration

Create two webhook endpoints in the Stripe Dashboard:

**Student Payments (Connect):**
- URL: `https://lmsplatform.com/api/stripe/webhook`
- Events: `payment_intent.succeeded`, `charge.refunded`, `payout.paid`
- Signing secret → `STRIPE_WEBHOOK_SECRET`

**Platform Billing:**
- URL: `https://lmsplatform.com/api/stripe/platform-webhook`
- Events: `checkout.session.completed`, `charge.refunded`, `invoice.payment_failed`
- Signing secret → `STRIPE_PLATFORM_WEBHOOK_SECRET`

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

## Recommendation

**Start with Supabase Cloud** to avoid managing Postgres backups, Auth configuration, and the custom access token hook. Migrate to self-hosted later once traffic justifies it.

The critical work is in **Sections 2-3**: getting Traefik wildcard SSL + DNS challenge working. Once that's done, subdomain routing works automatically via `proxy.ts`.
