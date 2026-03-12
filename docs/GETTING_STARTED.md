# Getting Started

## 🚀 Quick Start (5 minutes)

### Prerequisites
- Node.js 20+ installed
- npm or yarn
- Supabase account (for cloud) or Docker (for local)
- Git

### 1. Clone & Install

```bash
git clone <repository-url>
cd lms-front
npm install
```

### 2. Environment Setup

Create `.env.local`:

```bash
# Supabase Cloud (Recommended for development)
NEXT_PUBLIC_SUPABASE_URL=https://tcqqnjfwmbfwcyhafbbt.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your_anon_key_here

# Optional: Service role key for admin operations (DO NOT COMMIT!)
# SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Platform domain (required for subdomain routing)
NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000   # Local dev (use lmsplatform.com in prod)

# Stripe Connect (for student payments to schools)
# STRIPE_SECRET_KEY=sk_test_...
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...              # Webhook: /api/stripe/webhook

# Stripe Platform Billing (for school plan subscriptions to the platform)
# STRIPE_PLATFORM_WEBHOOK_SECRET=whsec_...     # Webhook: /api/stripe/platform-webhook
```

Get your keys from:
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select "LMS APP" project
3. Settings → API
4. Copy "URL" and "anon public" key

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Create Test Account

1. Navigate to `/auth/sign-up`
2. Enter email and password
3. Check email for confirmation link
4. Click link to confirm account
5. You'll be redirected to student dashboard (default role)

## 🔧 Development Setup Options

### Option 1: Cloud Supabase (Recommended)

**Pros**:
- No local setup required
- Shared database with team
- Production-like environment
- Automatic backups

**Cons**:
- Requires internet connection
- Shared state (can conflict with team)

**Setup**: Already done if you followed Quick Start!

### Option 2: Local Supabase

**Pros**:
- Works offline
- Isolated development environment
- Fast queries (no network latency)

**Cons**:
- Requires Docker
- More complex setup
- Need to sync schema changes

**Setup**:

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start

# Apply migrations
supabase db push

# Update .env.local with local URLs
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=<from supabase start output>
```

### Local Multi-Tenant Testing (Subdomains)

To test multi-tenant subdomain routing locally, use `lvh.me` — a free wildcard DNS that resolves `*.lvh.me` to `127.0.0.1`.

```bash
# In .env.local, set:
NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000
```

Then access:
- `http://lvh.me:3000` — Platform root (Default School)
- `http://your-school.lvh.me:3000` — Tenant subdomain

You can also use the `x-tenant-slug` header as a dev override (e.g., via browser extensions or API clients).

See `MULTI_TENANT_TESTING_REPORT.md` for full testing details.

## Project Structure

```
lms-front/
├── app/
│   ├── [locale]/                 # All routes wrapped in locale (en, es)
│   │   ├── (public)/            # Public pages (homepage, courses, etc.)
│   │   ├── auth/                # Auth pages (login, signup, etc.)
│   │   ├── dashboard/
│   │   │   ├── admin/          # Admin dashboard (25+ pages)
│   │   │   ├── student/        # Student dashboard (16+ pages)
│   │   │   └── teacher/        # Teacher dashboard (30+ pages)
│   │   ├── platform/            # Super admin panel
│   │   ├── create-school/       # School creation flow
│   │   ├── join-school/         # Join school via invitation
│   │   └── onboarding/         # Post-signup onboarding
│   ├── actions/
│   │   ├── admin/               # Admin server actions (billing, categories, courses, invitations, landing-pages, etc.)
│   │   ├── teacher/             # Teacher server actions
│   │   └── platform/            # Platform super admin actions
│   └── api/
│       ├── auth/                # Auth callbacks
│       ├── chat/                # AI chat endpoints (aristotle, exercises, lesson-task)
│       ├── exercises/           # Exercise evaluation (artifact, media)
│       ├── stripe/              # Payment webhooks & endpoints
│       ├── certificates/        # Certificate verification & generation
│       ├── teacher/             # Teacher tools (grading, preview, templates)
│       ├── cron/                # Scheduled tasks
│       └── mcp/                 # MCP protocol endpoint
│
├── components/
│   ├── admin/                    # Admin components (landing-page/, invite-user, etc.)
│   ├── aristotle/                # AI tutor panel
│   ├── exercises/                # Exercise UIs (artifact, audio, code, essay)
│   ├── gamification/             # Leaderboard, achievements, store
│   ├── lesson/                   # Lesson content blocks (22 types)
│   ├── onboarding/               # Onboarding wizard
│   ├── student/                  # Student-specific components
│   ├── teacher/                  # Teacher tools (block-editor/, exercise-builder)
│   ├── tenant/                   # Tenant management (create-school, css-vars)
│   ├── tours/                    # Guided tours (driver.js)
│   ├── ui/                       # Shadcn UI primitives (base-mira)
│   └── shared/                   # Shared components (feature-gate, onboarding-checklist)
│
├── lib/
│   ├── ai/                       # AI config, prompts (aristotle, grading)
│   ├── puck/                     # Landing page builder (config, components/, templates/)
│   ├── supabase/                 # DB clients (server, client, admin, tenant, proxy)
│   │   ├── client.ts            # Browser client
│   │   ├── server.ts            # Server client
│   │   ├── admin.ts             # Admin client (bypass RLS)
│   │   ├── proxy.ts             # Session update for middleware
│   │   ├── tenant.ts            # getCurrentTenantId()
│   │   └── get-user-role.ts     # Role utilities (reads tenant_users)
│   ├── hooks/                    # React hooks (usePlanFeatures, useEnrollment)
│   ├── plans/                    # Feature gating (features.ts)
│   ├── payments/                 # Stripe integration
│   ├── email/                    # Email templates
│   ├── speech/                   # Speech evaluation
│   ├── exercises/                # Exercise engine
│   ├── certificates/             # Certificate logic
│   ├── themes/                   # Theme presets
│   └── services/                 # Business logic services
│
├── mcp-server/                   # MCP server for AI agent integration
├── messages/                     # i18n messages (en.json, es.json)
├── supabase/                     # Supabase config
│   ├── migrations/              # Database migrations (63+ files)
│   └── config.toml              # Local Supabase config
├── tests/                        # Playwright E2E tests
│
├── proxy.ts                      # THE ONLY middleware file (tenant + i18n + auth)
├── .env.local                    # Environment variables (DO NOT COMMIT!)
├── package.json                  # Dependencies
└── tsconfig.json                # TypeScript config
```

**Important:** `proxy.ts` is the single middleware file for the entire application. Do NOT create a `middleware.ts` file — it will conflict with `proxy.ts`.

## 🧪 Verify Setup

### 1. Check Database Connection

```bash
# If using local Supabase
supabase status

# Should show:
# - API URL: http://127.0.0.1:54321
# - DB URL: postgresql://postgres:postgres@localhost:54322/postgres
```

### 2. Test Auth Flow

1. Visit http://localhost:3000/auth/sign-up
2. Create account
3. Check email (or check local mailpit at http://localhost:54324 if using local Supabase)
4. Confirm email
5. Should redirect to `/dashboard/student`

### 3. Check Database

```bash
# Using Supabase CLI
supabase db diff

# Should show: "No schema changes detected"

# Or check Studio
# Local: http://localhost:54323
# Cloud: https://app.supabase.com
```

## 🎨 Adding Shadcn Components

```bash
# List available components
npx shadcn@latest add

# Add specific component
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add form

# Components are added to components/ui/
```

## 🗄️ Database Management

### View Schema

```bash
# Dump current schema
supabase db dump --local

# Or use Studio
# Local: http://localhost:54323
# Cloud: https://app.supabase.com → Table Editor
```

### Create Migration

```bash
# Create new migration file
supabase migration new add_my_feature

# Edit the generated file in supabase/migrations/

# Apply migration
supabase db push
```

### Reset Database (Local Only)

```bash
supabase db reset
```

⚠️ **Warning**: This deletes ALL local data!

## Managing Roles

The `tenant_users` table is the **authoritative source** for user roles within a tenant. The `user_roles` table stores global roles but `tenant_users.role` is what `getUserRole()` checks first.

### Change Your Role (for testing)

**Via SQL Editor** (Supabase Studio):

```sql
-- Set your role within a specific tenant (authoritative source)
-- Roles: 'student', 'teacher', 'admin'
UPDATE tenant_users
SET role = 'teacher'
WHERE user_id = auth.uid()
  AND tenant_id = '00000000-0000-0000-0000-000000000001';

-- If no tenant_users row exists, insert one
INSERT INTO tenant_users (user_id, tenant_id, role)
VALUES (auth.uid(), '00000000-0000-0000-0000-000000000001', 'teacher')
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'teacher';

-- Global role (fallback only — tenant_users takes priority)
INSERT INTO user_roles (user_id, role)
VALUES (auth.uid(), 'teacher')
ON CONFLICT (user_id, role) DO NOTHING;
```

**Refresh your session** to see the new role — call `supabase.auth.refreshSession()` or log out and back in to get updated JWT claims.

## 📝 Common Commands

```bash
# Development
npm run dev              # Start dev server
npm run build           # Build for production
npm run start           # Start production server

# Database (Supabase CLI)
supabase start          # Start local Supabase
supabase stop           # Stop local Supabase
supabase status         # Check status
supabase db push        # Apply migrations
supabase db pull        # Pull from cloud to local
supabase db diff        # Show schema differences
supabase db reset       # Reset local database

# Code Quality
npm run lint            # Run ESLint
```

## 🐛 Troubleshooting

### "Module not found" errors

```bash
# Clear cache and reinstall
rm -rf node_modules .next package-lock.json
npm install
```

### Database connection issues

```bash
# Check if Supabase is running
supabase status

# Restart Supabase
supabase stop
supabase start

# Check .env.local has correct URLs
cat .env.local
```

### Auth not working

1. Check environment variables are set
2. Verify Supabase project is accessible
3. Check browser console for errors
4. Try incognito mode (clear cookies)

### Page shows "Unauthorized"

1. Check if you're logged in: `/auth/login`
2. Verify your role: Check `tenant_users` table (authoritative) and `user_roles` table (fallback)
3. Check `proxy.ts` is working (this is the only middleware file — not `middleware.ts`)
4. Verify RLS policies allow access
5. After changing roles, call `supabase.auth.refreshSession()` to update JWT claims

## 📚 Next Steps

1. **Explore the codebase**:
   - Check out `app/dashboard/student/page.tsx`
   - Look at `lib/supabase/` utilities
   - Browse `components/ui/` Shadcn components

2. **Read the docs**:
   - [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) - Understand the architecture
   - [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Learn the data model
   - [AUTH.md](./AUTH.md) - Understand authentication

3. **Start building**:
   - Pick a task from [PROGRESS.md](../PROGRESS.md)
   - Read [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)
   - Follow patterns in [AI_AGENT_GUIDE.md](./AI_AGENT_GUIDE.md)

## 🤝 Getting Help

- **Documentation**: Check `docs/` folder
- **Code Examples**: Search codebase for similar features
- **Database Questions**: See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
- **Auth Questions**: See [AUTH.md](./AUTH.md)

Happy coding! 🚀
