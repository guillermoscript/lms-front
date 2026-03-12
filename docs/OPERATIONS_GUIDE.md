# Platform Operations Guide

> **Who this is for:** You — the person running this SaaS LMS platform. This guide walks you
> through every step from zero to a live platform collecting students and money from schools.

---

## Table of Contents

1. [What You're Running](#1-what-youre-running)
2. [Initial Setup](#2-initial-setup)
3. [Running Locally](#3-running-locally)
4. [Deploying to Production](#4-deploying-to-production)
5. [Becoming the Super Admin](#5-becoming-the-super-admin)
6. [The Platform Panel — Your Control Room](#6-the-platform-panel--your-control-room)
7. [Inviting Schools — The Referral System](#7-inviting-schools--the-referral-system)
8. [How a School Gets Started](#8-how-a-school-gets-started)
9. [How Students Join and Learn](#9-how-students-join-and-learn)
10. [How Payments Work](#10-how-payments-work)
11. [Making Money — Platform Billing](#11-making-money--platform-billing)
12. [Day-to-Day Operations Checklist](#12-day-to-day-operations-checklist)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. What You're Running

This is a **multi-tenant SaaS LMS**. Think of it like Shopify but for online schools:

```
Your Platform (lvh.me or yourdomain.com)
  └── School A   → schoola.yourdomain.com
       ├── Courses, lessons, exams
       ├── Their students (isolated — can't see School B's data)
       └── Their revenue (Stripe Connect)
  └── School B   → schoolb.yourdomain.com
  └── School C   → schoolc.yourdomain.com
```

**Three types of users:**

| Role | Where they live | What they do |
|------|----------------|--------------|
| **Super Admin** | `/platform` | You. Run the whole SaaS. |
| **School Admin** | `/dashboard/admin` | Run their school, manage courses, approve payments. |
| **Student / Teacher** | `/dashboard/student` or `/dashboard/teacher` | Take or create courses. |

**How you make money:**
- Schools pay you a monthly/yearly subscription (Free → $9 → $29 → $79 → $199/mo)
- You take a transaction fee on every student payment (10% free tier → 0% paid tiers)

---

## 2. Initial Setup

### 2a. Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier is fine to start)
- A [Stripe](https://stripe.com) account with Connect enabled
- (Optional) A [Mailgun](https://mailgun.com) account for transactional email
- (Optional) An [OpenAI](https://openai.com) API key for AI features
- (Optional) MCP server for AI assistant integration (see `docs/MCP_SETUP.md`)

### 2b. Clone and install

```bash
git clone <your-repo>
cd lms-front
npm install
```

### 2c. Configure environment variables

Copy the example file and fill in every value:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

```bash
# ─── SUPABASE ───────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # KEEP SECRET — bypasses RLS

# ─── YOUR PLATFORM DOMAIN ───────────────────────────────────────
NEXT_PUBLIC_PLATFORM_DOMAIN=yourdomain.com
# For local dev, use:
# NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000

# ─── STRIPE (student payments — Stripe Connect) ─────────────────
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...    # From your Connect webhook

# ─── STRIPE (school billing — Stripe Billing) ───────────────────
STRIPE_PLATFORM_WEBHOOK_SECRET=whsec_...   # Different webhook!

# ─── AI (optional but recommended) ─────────────────────────────
OPENAI_API_KEY=sk-...

# ─── EMAIL (optional but recommended) ──────────────────────────
MAILGUN_API_KEY=key-...
MAILGUN_DOMAIN=mg.yourdomain.com
EMAIL_FROM=noreply@yourdomain.com

# ─── CERTIFICATES ───────────────────────────────────────────────
CERTIFICATE_ENCRYPTION_KEY=any-random-32-char-string

# ─── CRON (for subscription expiry) ────────────────────────────
CRON_SECRET=any-random-secret
```

### 2d. Push the database schema

```bash
# Apply all migrations to your Supabase project
supabase db push
```

This creates all 65+ tables, RLS policies, indexes, RPCs, and triggers.

### 2e. Deploy Supabase Edge Functions (for AI + gamification)

```bash
supabase functions deploy get-leaderboard
supabase functions deploy spend-points
supabase functions deploy get-plan-features
supabase functions deploy get-gamification-summary
supabase functions deploy check-achievements
```

---

## 3. Running Locally

### Start the dev server

```bash
npm run dev
# → http://localhost:3000
```

### Access with subdomain routing

The platform uses subdomains for tenant isolation. Locally, `lvh.me` is a magic domain
that routes all subdomains to `localhost`:

| URL | What you see |
|-----|-------------|
| `http://lvh.me:3000` | Default school (tenant `00000000-0000-0000-0000-000000000001`) |
| `http://myschool.lvh.me:3000` | The `myschool` tenant |
| `http://lvh.me:3000/en/platform` | Super admin panel |

Make sure `.env.local` has:
```bash
NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000
```

### Test accounts (local Supabase only)

| Email | Password | Role |
|-------|----------|------|
| `owner@e2etest.com` | `password123` | School admin (Default School) |
| `student@e2etest.com` | `password123` | Student (Default School) |
| `creator@codeacademy.com` | `password123` | Admin (Code Academy Pro) |
| `alice@student.com` | `password123` | Student (Code Academy Pro) |

---

## 4. Deploying to Production

### 4a. Deploy to Vercel

```bash
# Connect repo to Vercel, then:
vercel --prod
```

Set all environment variables from `.env.example` in Vercel's dashboard
under **Project → Settings → Environment Variables**.

### 4b. Configure DNS

For each school to get their own subdomain, you need a **wildcard DNS record**:

```
Type: A
Name: *
Value: 76.76.21.21   (Vercel's IP)
```

This makes `anyschool.yourdomain.com` resolve to your app.

Then in Vercel, add `*.yourdomain.com` as a custom domain for your project.

### 4c. Configure Stripe webhooks

You need **two separate webhooks** in Stripe:

**Webhook 1 — Student Payments (Stripe Connect):**
```
Endpoint: https://yourdomain.com/api/stripe/webhook
Events: payment_intent.succeeded, charge.refunded, payout.paid, charge.dispute.created
```
→ Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

**Webhook 2 — School Billing (Stripe Billing):**
```
Endpoint: https://yourdomain.com/api/stripe/platform-webhook
Events: checkout.session.completed, invoice.payment_failed, customer.subscription.deleted
```
→ Copy the signing secret to `STRIPE_PLATFORM_WEBHOOK_SECRET`

### 4d. Configure Vercel Cron

The `vercel.json` file already configures a daily cron job that expires lapsed
school subscriptions. Vercel runs this automatically on Pro+ plans.

The cron calls `/api/cron/expire-subscriptions` with your `CRON_SECRET` header.

---

## 5. Becoming the Super Admin

This is the most important step. Without this, you can't access `/platform`.

### Step 1 — Create your user account

Go to your live app and sign up with your email at `/en/auth/signup`.

### Step 2 — Get your user UUID

In Supabase dashboard → **Authentication → Users**, find your email and copy the UUID.

### Step 3 — Insert into super_admins table

In Supabase dashboard → **SQL Editor**, run:

```sql
INSERT INTO super_admins (user_id)
VALUES ('paste-your-uuid-here');
```

### Step 4 — Verify access

Go to `https://yourdomain.com/en/platform` — you should see the platform overview
dashboard. If you're redirected to login, double-check the UUID matches.

> **Security note:** `isSuperAdmin()` queries the `super_admins` table directly on every
> request — it never trusts the JWT. Only you can add rows to this table.

---

## 6. The Platform Panel — Your Control Room

Everything at `/platform` is for you only. Schools and students can never access it.

### Overview Dashboard `/platform`

Your business at a glance:

- **MRR** — sum of all active monthly subscriptions
- **Active Schools** — tenants currently on a paid plan
- **New Schools (30d)** — growth this month
- **Total Students** — across all tenants
- **Pending Payments** — manual bank transfers waiting for your confirmation
- **Plan Distribution** — bar chart showing Free / Starter / Pro / Business breakdown

### Tenant Management `/platform/tenants`

Every school on your platform, with:
- Plan badge (Free / Starter / Pro / Business / Enterprise)
- Status (active / suspended)
- Student count, course count
- Monthly revenue contribution

**Actions on each school:**
| Action | What it does |
|--------|-------------|
| View Details | See their full stats, subscription history, admin users |
| Impersonate User | Sign in as any user in that school (for support) |
| Change Plan | Force a plan upgrade/downgrade |
| Suspend | Disable school access (keeps data, blocks login) |
| Reactivate | Re-enable a suspended school |

### Impersonating a User (for support)

When a school owner reports a bug or needs help:

1. Go to `/platform/tenants` → find the school → click **View Details**
2. Click **Impersonate User** → pick the user from the dropdown
3. Click **Sign in as [Name]** — you'll be redirected and logged in as them
4. You see exactly what they see; a yellow banner shows "Impersonating [Name]"
5. Click **Exit Impersonation** to return to your super admin session

> Every impersonation is logged in the `impersonation_log` table for audit purposes.

### Billing Management `/platform/billing`

When a school pays via bank transfer instead of Stripe, you confirm it here.

Tabs:
- **Pending** — needs your action (most important)
- **Confirmed** — done
- **Rejected** — declined
- **All** — full history

For each pending request:
1. Check the bank reference against your bank statement
2. Click **Confirm** — this activates their plan and extends their billing period
3. Or **Reject** with a reason — they get notified

### Plans Editor `/platform/plans`

Edit your pricing tiers directly from the UI — no SQL needed.

You can change:
- Monthly and yearly prices
- Transaction fee percentages
- Feature limits (max courses, max students)
- Feature flags (gamification, custom branding, API access)
- Deactivate a plan to hide it from new signups (existing subscribers keep it)

> Changes take effect immediately for new signups. Existing subscribers are NOT affected.

### Referral Dashboard `/platform/referrals`

See the full referral funnel:
- Codes created vs. redeemed
- Referrer → referee relationships
- Pending rewards (referrer hasn't been rewarded yet because referee hasn't paid)
- Create custom platform-wide referral codes

---

## 7. Inviting Schools — The Referral System

This is your main growth channel. There are two types of referral codes.

### Type 1: You invite schools (platform-level codes)

Go to `/platform/referrals` → **Generate Code** → set:
- Code (e.g. `EARLYBIRD`)
- Discount months for new schools (e.g. 2 = 2 free months)
- Referrer reward months (0 for platform-generated codes)
- Max uses (or unlimited)

Share the link: `https://yourdomain.com/en/create-school?ref=EARLYBIRD`

When a school signs up using this link:
- They get 2 free months on their chosen plan
- You track the conversion in `/platform/referrals`

### Type 2: Schools invite other schools (tenant referral codes)

School admins can get their own referral code from:
**Settings → Referral Program** (in `/dashboard/admin/settings`)

A card shows their referral URL: `yourdomain.com/create-school?ref=ACMEX3F`

When they share it and a new school signs up:
- New school gets **1 free month**
- Referring school gets **1 free month** when the new school makes their first payment

> Rewards are only issued after the first real payment — prevents abuse.

### The reward flow in detail

```
1. School A shares link: yourdomain.com/create-school?ref=ACMEX3F
2. School B signs up using that link
   → referral_redemptions row created
   → School B's billing_period_end extended by discount_months (immediately)
3. School B makes first payment (Stripe or confirmed bank transfer)
   → applyReferralCode() runs
   → School A's billing_period_end extended by referrer_reward_months
   → referral_redemptions.referrer_rewarded set to true
```

---

## 8. How a School Gets Started

### Step 1: School owner creates their school

They go to `yourdomain.com/en/create-school` — a **unified create-school flow** with cross-subdomain authentication that handles:
- School name
- Subdomain slug (e.g. `myacademy` → `myacademy.yourdomain.com`)
- Account creation or existing account login

This creates a `tenants` row and makes them the school admin.

They start on the **Free plan** (5 courses, 50 students, 10% transaction fee).

### Step 1b: Onboarding wizard

After school creation, admins are guided through an **onboarding wizard** that walks them through initial setup steps (branding, first course, payment configuration). This reduces the blank-slate experience and helps new schools get started quickly.

### Step 2: School admin sets up their school

They log in at `myacademy.yourdomain.com` and land on `/dashboard/admin`.

**First things to configure (Settings → General):**
- School name, logo, description
- Contact email
- Default currency

**Settings → Branding:**
- Primary color (used throughout the student experience)
- Logo URL

**Settings → Payment:**
- Connect their Stripe account (for student payments via Stripe Connect)
- Or use manual bank transfer (you confirm each payment manually)

### Step 3: School admin creates courses

1. Go to `/dashboard/admin/courses` → **New Course**
2. Fill in title, description, thumbnail
3. Add lessons: click into the course → **Add Lesson** → use the block editor
   - Text blocks (MDX)
   - Video blocks (upload or YouTube embed)
   - Exercise blocks (quizzes, code challenges)
4. Set the course to **Published** when ready

### Step 4: School admin creates a product

A product is the thing students pay for. It can bundle multiple courses.

1. Go to `/dashboard/admin/products` → **New Product**
2. Set price, currency, payment type (Stripe / manual / PayPal)
3. Add courses to the product
4. Publish it

### Step 5: School admin invites students

Option A — Students find the school and join at `myacademy.yourdomain.com`

Option B — Admin uses the **invitation system**:
- Go to `/dashboard/admin/users` → **Invite User** → enter their email and role
- They get an email invitation to join the school
- Invitations can be managed (resend, revoke) from the admin panel

### Step 5b: School admin creates a landing page

Admins can build a public-facing landing page using the **Puck v0.20 visual editor**:
- Go to `/dashboard/admin/landing-page` → drag-and-drop editor with 32 components
- Choose from 8 built-in templates (Modern Academy, Minimal, Bold Creator, etc.)
- Preview and publish — the landing page appears at the school's subdomain root

### Step 6: School upgrades their plan (when they outgrow Free)

When they hit the student or course limit, they see a prompt to upgrade.

They go to `/dashboard/admin/billing` and choose:
- **Stripe** → instant, automated
- **Bank Transfer** → manual, you confirm at `/platform/billing`

---

## 9. How Students Join and Learn

### Joining a school

1. Student goes to `myacademy.yourdomain.com`
2. Clicks **Sign Up** or **Log In** → lands on `/join-school`
3. Clicks **Join** — this calls `joinCurrentSchool()`:
   - Checks the school hasn't hit its student limit
   - Inserts a `tenant_users` row (role: student)
   - Refreshes their JWT to include `tenant_id` and `tenant_role`
   - Sends them a welcome email (via Mailgun)
4. They're redirected to `/dashboard/student`

### Enrolling in a course

If the course is free: they click **Enroll** and they're in.

If the course requires payment:

**Stripe flow:**
1. Student clicks **Buy** on a product
2. Stripe PaymentIntent is created (platform takes its fee cut automatically)
3. Student completes payment on the checkout page
4. Stripe webhook fires → `enroll_user()` RPC runs → `enrollments` row created
5. Student can now access all courses in the product

**Manual/Bank transfer flow:**
1. Student clicks **Request Enrollment**
2. Creates a `payment_requests` row (status: pending)
3. School admin sees it in `/dashboard/admin/payment-requests`
4. Admin sends bank transfer instructions
5. Student pays and marks as paid
6. Admin confirms → `enroll_user()` runs → enrollment active

### Learning experience

Once enrolled:
- `/dashboard/student/courses` — all enrolled courses
- Each course shows progress (lessons completed / total)
- Lessons auto-mark complete after engagement
- **Gamification:** XP earned per lesson, leaderboard ranking, achievements unlocked
- **Certificates:** Auto-issued when all lessons in a course are complete
- Students can download or share their certificate; `/verify/[code]` for public verification

---

## 10. How Payments Work

### Two completely separate Stripe integrations

```
Student pays School       →  Stripe Connect (PaymentIntents)
School pays Platform      →  Stripe Billing (Subscriptions/Checkout)
```

Do not confuse them — they have different webhook secrets!

### Student → School payments (Stripe Connect)

1. School connects their Stripe account in settings
2. When a student pays, your platform creates a PaymentIntent with:
   - `transfer_data.destination` = school's Stripe account
   - `application_fee_amount` = platform transaction fee (based on school's plan)
3. Money flows: Student → Platform → School (minus platform fee)
4. Platform fee is automatically deposited to your Stripe account

### Transaction fee by plan

| Plan | Fee on every sale |
|------|------------------|
| Free | 10% |
| Starter ($9/mo) | 5% |
| Pro ($29/mo) | 2% |
| Business ($79/mo) | 0% |
| Enterprise ($199/mo) | 0% |

> School on Starter pays you $9/mo + 5% of every student sale.
> School on Business pays you $79/mo and keeps 100% of student sales.

### Manual payments (for markets without Stripe)

Schools in LATAM often use bank transfers. The flow:

1. Student requests enrollment (creates `payment_requests` row)
2. School admin sends bank details via the admin panel
3. Student transfers money to school's bank
4. School admin confirms receipt → enrollment activated

As platform owner, you get your cut via the school's subscription fee (not per-transaction).

---

## 11. Making Money — Platform Billing

### How schools pay you

Schools have two options on the billing page (`/dashboard/admin/billing`):

**Option A: Stripe (automated)**
- School enters credit card → Stripe Checkout → subscription starts
- Renewals are automatic; failed payments trigger dunning emails
- Cancellations downgrade to Free immediately

**Option B: Bank Transfer (manual)**
- School submits a `platform_payment_requests` row
- You confirm at `/platform/billing` after checking your bank
- Their plan upgrades and billing period extends

### Your plan prices (editable at `/platform/plans`)

| Plan | Monthly | Yearly | Transaction Fee |
|------|---------|--------|-----------------|
| Free | $0 | $0 | 10% |
| Starter | $9 | $90 | 5% |
| Pro | $29 | $290 | 2% |
| Business | $79 | $790 | 0% |
| Enterprise | $199 | $1,990 | 0% |

> Yearly = ~17% discount. Good to push annual plans for predictable MRR.

### Subscription lifecycle

```
School signs up → Free plan (no billing)
School upgrades → platform_subscriptions row created, tenants.plan updated
School's card fails → status = past_due, email sent
School's card fails repeatedly → status = canceled, plan → Free
School's subscription expires → daily cron job catches it, downgrades to Free
```

The cron job (`/api/cron/expire-subscriptions`) runs daily at 02:00 UTC automatically
on Vercel (configured in `vercel.json`).

---

## 12. Day-to-Day Operations Checklist

### Every morning (5 minutes)

1. Open `/platform` — check MRR trend and any alerts
2. Open `/platform/billing` → **Pending** tab — confirm any bank transfers waiting
3. Check email for any failed subscription notifications

### Weekly

1. `/platform/tenants` — review new schools from last 7 days
2. Check for schools on Free approaching limits (likely to upgrade)
3. `/platform/referrals` — see pending referral rewards to confirm

### Monthly

1. Review plan distribution — are most schools on Free? Consider a promotion.
2. Check churned schools (status: suspended/canceled)
3. Export transaction history for accounting
4. Update plan prices if needed at `/platform/plans`

### When a school reports a problem

1. Go to `/platform/tenants` → find their school → **View Details**
2. Click **Impersonate User** → select the affected user
3. Reproduce the issue from their perspective
4. Click **Exit Impersonation** when done
5. Fix the issue or escalate to engineering

---

## 13. Troubleshooting

### "I can't access /platform"

→ Your user UUID is not in the `super_admins` table.
```sql
-- In Supabase SQL editor:
SELECT user_id FROM super_admins;
-- If your UUID isn't listed:
INSERT INTO super_admins (user_id) VALUES ('your-uuid');
```

### "A school's plan didn't update after bank transfer confirmation"

→ Check the `platform_payment_requests` row status. If it's still `pending`,
the confirmation action failed. In Supabase, manually update:
```sql
UPDATE tenants SET plan = 'starter' WHERE id = 'tenant-uuid';
UPDATE platform_payment_requests SET status = 'confirmed' WHERE request_id = 'uuid';
```

### "Student paid via Stripe but isn't enrolled"

→ The webhook probably failed to fire. Check Supabase logs:
- Supabase Dashboard → **Edge Functions → Logs** (if using edge function webhook)
- Or check `/api/stripe/webhook` logs in Vercel

To manually enroll:
```sql
SELECT enroll_user('user-uuid', 'product-uuid');
```

### "Referral reward wasn't applied"

→ Reward only fires after the referee's **first payment** is confirmed.
Check `referral_redemptions` table:
```sql
SELECT * FROM referral_redemptions WHERE redeemed_by_tenant_id = 'tenant-uuid';
-- referrer_rewarded should flip to true after first payment
```

### "Subscription expiry cron isn't running"

→ Vercel Cron requires a Pro plan. Check Vercel dashboard → **Cron Jobs** tab.
You can also trigger it manually:
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://yourdomain.com/api/cron/expire-subscriptions
```

### "Build fails after pulling latest code"

```bash
npm install        # sync dependencies
npm run build      # check for TypeScript errors
```

Common fixes: missing env var, or a DB migration not applied yet (`supabase db push`).

---

## Quick Reference

### Key URLs

| URL | Purpose |
|-----|---------|
| `/en/platform` | Your super admin control room |
| `/en/platform/billing` | Confirm manual bank transfers |
| `/en/platform/tenants` | Manage all schools |
| `/en/create-school` | Where new schools sign up |
| `school.yourdomain.com/en/dashboard/admin` | School admin panel |
| `school.yourdomain.com/en/dashboard/student` | Student learning portal |

### Key Database Tables

| Table | What's in it |
|-------|-------------|
| `super_admins` | Your user ID |
| `tenants` | Every school: plan, billing status, Stripe customer ID |
| `tenant_users` | Who belongs to which school, with what role |
| `platform_plans` | Your pricing tiers |
| `platform_subscriptions` | One per school, active Stripe subscription |
| `platform_payment_requests` | Manual bank transfer requests |
| `referral_codes` | Referral codes (tenant or platform level) |
| `referral_redemptions` | Who used which code, reward status |
| `enrollments` | Student ↔ product access records |
| `transactions` | Every payment attempt |

### Key Environment Variables (the critical ones)

| Variable | Why it matters |
|----------|---------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS — never expose publicly |
| `STRIPE_WEBHOOK_SECRET` | Validates Connect webhooks (student payments) |
| `STRIPE_PLATFORM_WEBHOOK_SECRET` | Validates Billing webhooks (school payments) |
| `CRON_SECRET` | Secures subscription expiry endpoint |
| `NEXT_PUBLIC_PLATFORM_DOMAIN` | Controls subdomain routing for all tenants |

---

*Last updated: February 2026*
