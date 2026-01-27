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

## 📁 Project Structure

```
lms-front/
├── app/                          # Next.js App Router
│   ├── auth/                     # Auth pages (login, signup, etc.)
│   ├── dashboard/                # Protected dashboards
│   │   ├── student/             # Student dashboard
│   │   ├── teacher/             # Teacher dashboard
│   │   └── admin/               # Admin dashboard
│   ├── globals.css              # Global styles + Tailwind
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Home page
│
├── components/                   # React components
│   ├── ui/                      # Shadcn UI components
│   ├── login-form.tsx           # Auth forms
│   └── ...
│
├── lib/                         # Utilities
│   ├── supabase/               # Supabase clients
│   │   ├── client.ts           # Browser client
│   │   ├── server.ts           # Server client
│   │   ├── middleware.ts       # Auth middleware
│   │   └── get-user-role.ts    # Role utilities
│   └── utils.ts                # General utilities (cn, etc.)
│
├── docs/                        # Documentation (you are here!)
│   ├── README.md               # Docs index
│   ├── PROJECT_OVERVIEW.md     # High-level overview
│   ├── DATABASE_SCHEMA.md      # Database reference
│   ├── AUTH.md                 # Auth guide
│   └── ...
│
├── supabase/                    # Supabase config
│   ├── migrations/             # Database migrations
│   │   └── 20260126190500_lms_complete.sql
│   └── config.toml             # Local Supabase config
│
├── middleware.ts                # Next.js middleware (route protection)
├── .env.local                   # Environment variables (DO NOT COMMIT!)
├── package.json                 # Dependencies
└── tsconfig.json               # TypeScript config
```

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

## 🔑 Managing Roles

### Change Your Role (for testing)

**Via SQL Editor** (Supabase Studio):

```sql
-- Make yourself a teacher
INSERT INTO user_roles (user_id, role)
VALUES (auth.uid(), 'teacher')
ON CONFLICT (user_id, role) DO NOTHING;

-- Make yourself an admin
INSERT INTO user_roles (user_id, role)
VALUES (auth.uid(), 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Remove a role
DELETE FROM user_roles
WHERE user_id = auth.uid() AND role = 'teacher';
```

**Refresh your session** to see the new role:
```bash
# Log out and log back in
```

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
2. Verify your role: Check `user_roles` table
3. Check middleware is working: Add console.log
4. Verify RLS policies allow access

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
