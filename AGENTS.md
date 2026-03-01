# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LMS V2 is a modern Learning Management System built with Next.js 16 and Supabase. This is a complete rebuild prioritizing exceptional UX for students and teachers. The project uses **Row Level Security (RLS) for direct database queries** instead of server actions for CRUD operations.

**Key Technologies:**

- Next.js 16.1.5 (App Router, React 19)
- Supabase (PostgreSQL 15, Auth, Storage)
- Shadcn UI (base-mira theme)
- Tailwind CSS v4
- TypeScript (strict mode)
- Stripe for payments

## Commands

### Development

```bash
npm run dev          # Start development server at http://localhost:3000
npm run build        # Build for production (checks TypeScript/lint errors)
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Database (Supabase)

```bash
supabase db pull     # Pull schema from cloud
supabase db push     # Push migrations to cloud
supabase migration new <name>  # Create new migration file
```

**Important**: Database migrations are in `supabase/migrations/`. The database has 44 tables with comprehensive RLS policies.

## Available Skills

This project has custom Claude Code skills available in `skills/`:

### `/web-design-guidelines`

Review UI code for Web Interface Guidelines compliance. Use this skill when:

- Reviewing UI implementations
- Checking accessibility compliance
- Auditing design patterns
- Ensuring best practices for web interfaces

**Usage:**

```bash
/web-design-guidelines app/dashboard/student/page.tsx
/web-design-guidelines "app/dashboard/**/*.tsx"
```

This skill fetches the latest Web Interface Guidelines and validates code against them, reporting findings in `file:line` format.

## MCP Integration

This project includes a **Model Context Protocol (MCP) server** that allows AI assistants like Claude to interact with the LMS database through secure, authenticated tools.

### What is MCP?

MCP enables AI assistants to:
- Create and manage courses, lessons, and exams
- View student progress and submissions
- Access course content and metadata
- Perform CRUD operations with proper authentication

### Security Model

The MCP server uses **HTTP Proxy Authentication**:
- No credentials stored in Claude or external tools
- Users authenticate through existing LMS session (cookies)
- All actions tracked per user with full audit trail
- Role-based access (teachers and admins only)
- Rate limiting: 100 requests/minute per user

### Quick Start

1. **Start the MCP server**:
   ```bash
   cd mcp-server
   npm install
   npm run build
   npm run start:http
   ```

2. **Configure environment**: Ensure `.env` has Supabase credentials and shared secret

3. **Connect Claude**: Add MCP server in Claude settings at `http://localhost:3001/mcp`

### Available Capabilities

- **27 tools** for course/lesson/exam/exercise management
- **3 resources** for accessing course, lesson, and exam data
- **4 prompts** for guided content creation
- **Full audit trail** in `mcp_audit_log` table

### Documentation

- **[MCP Setup Guide](docs/MCP_SETUP.md)** - Complete setup instructions
- **[MCP Server README](mcp-server/README.md)** - Technical documentation
- Architecture: HTTP proxy → MCP server → Supabase with RLS

### Audit Trail

All MCP actions are logged to the `mcp_audit_log` table:
- User ID and role
- Tool/method called
- Success/failure status
- Request duration
- Sanitized parameters (sensitive data redacted)

Query recent activity:
```sql
SELECT * FROM mcp_audit_log ORDER BY created_at DESC LIMIT 50;
```

## Architecture & Key Patterns

### 1. Database Queries via RLS (Core Pattern)

**DO THIS** - Direct queries with RLS protection:

```typescript
// Server component
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();
const { data } = await supabase
  .from("courses")
  .select("*, lessons(count)")
  .eq("id", courseId)
  .single();
```

**AVOID THIS** - Server actions for simple CRUD:

```typescript
// ❌ Don't create server actions for basic queries
async function getCourse(id: number) {
  "use server";
  // ... server action for simple query
}
```

**When to use server actions:**

- Complex multi-step operations (e.g., payment processing)
- Operations requiring service role permissions
- External API interactions
- Business logic that shouldn't be exposed to client

### 2. Authentication & Authorization

**JWT Claims**: User roles are injected into JWT via `custom_access_token_hook()` database function.

**Getting user role:**

```typescript
import { getUserRole } from "@/lib/supabase/get-user-role";

const role = await getUserRole(); // 'student' | 'teacher' | 'admin' | null
```

**Roles:**

- `student` (default) - Can enroll in and complete courses
- `teacher` - Can create and manage courses
- `admin` - Full system access

**Route protection**: Middleware handles role-based routing. Protected routes redirect based on user role:

- `/dashboard/student` - Students only
- `/dashboard/teacher` - Teachers and admins
- `/dashboard/admin` - Admins only

### 3. Component Structure

**Prefer server components:**

```typescript
// ✅ Server component fetches data
export default async function CoursePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('id', params.id)
    .single()

  return <CourseView course={course} />
}
```

**Use client components only when needed:**

- Interactive features (forms, buttons with state)
- Browser APIs (localStorage, window)
- React hooks (useState, useEffect)

Mark client components with `'use client'` directive.

### 4. File Structure

```
app/
├── auth/                      # Auth pages (login, signup, etc.)
├── dashboard/
│   ├── student/              # Student dashboard & features
│   ├── teacher/              # Teacher dashboard & features
│   └── admin/                # Admin dashboard
├── api/
│   └── stripe/               # Stripe webhooks & payment APIs
└── layout.tsx

components/
├── ui/                       # Shadcn components (auto-generated)
├── student/                  # Student-specific components
└── teacher/                  # Teacher-specific components

lib/
├── supabase/
│   ├── client.ts            # Client-side Supabase client
│   ├── server.ts            # Server-side Supabase client
│   ├── get-user-role.ts     # Role detection utilities
│   └── middleware.ts        # Session management for middleware
├── stripe.ts                # Stripe client
└── utils.ts                 # Utilities (cn helper, etc.)

docs/                        # Comprehensive documentation
├── PROJECT_OVERVIEW.md      # Architecture & goals
├── DATABASE_SCHEMA.md       # Complete schema reference
├── AUTH.md                  # Authentication flows
└── AI_AGENT_GUIDE.md        # AI-specific development patterns
```

## Database Schema Essentials

### Core Tables

**Users & Roles:**

- `profiles` - User profiles (auto-created on signup)
- `user_roles` - Role assignments (many-to-many)

**Content:**

- `courses` - Course catalog
- `lessons` - Course lessons (MDX content)
- `exercises` - Practice exercises
- `exams` - Assessments with questions
- `exam_questions` - Individual questions
- `question_options` - Multiple choice options

**Progress Tracking:**

- `enrollments` - Course access
- `lesson_completions` - Lesson progress
- `exam_submissions` - Exam attempts with AI feedback

**Commerce:**

- `products` - Individual course products
- `plans` - Subscription plans
- `transactions` - Payment records
- `subscriptions` - Active subscriptions

### Key Database Functions

**Must know:**

```typescript
// Enroll user in courses linked to product
await supabase.rpc("enroll_user", {
  _user_id: userId,
  _product_id: productId,
});

// Create exam submission
await supabase.rpc("create_exam_submission", {
  student_id: userId,
  exam_id: examId,
  answers: { "1": "answer text", "2": "option_id" },
});

// Save AI feedback for exam
await supabase.rpc("save_exam_feedback", {
  submission_id: submissionId,
  exam_id: examId,
  student_id: userId,
  answers: answersJson,
  overall_feedback: feedbackText,
  score: scoreNumber,
});
```

**Triggers:**

- `handle_new_user()` - Auto-creates profile and assigns 'student' role on signup
- `trigger_manage_transactions()` - Auto-processes successful payments

### Common Query Patterns

**Course with nested data:**

```typescript
const { data } = await supabase
  .from("courses")
  .select(
    `
    *,
    lessons (
      *,
      lesson_completions (completed_at)
    ),
    enrollments (enrolled_at)
  `,
  )
  .eq("id", courseId)
  .eq("lessons.lesson_completions.student_id", userId)
  .order("sequence", { foreignTable: "lessons" })
  .single();
```

**Student's enrolled courses:**

```typescript
const { data } = await supabase
  .from("enrollments")
  .select(
    `
    *,
    course:courses (
      *,
      lessons (count)
    )
  `,
  )
  .eq("user_id", userId)
  .eq("status", "active");
```

## Development Guidelines

### Code Style

**TypeScript:**

- Use strict mode (already configured)
- Avoid `any` type - use proper interfaces
- Path alias `@/*` maps to root directory

**Component patterns:**

```typescript
// ✅ Proper typing
interface CourseCardProps {
  course: {
    id: number
    title: string
    status: 'draft' | 'published' | 'archived'
  }
}

// ✅ Server component by default
export default async function Page() { ... }

// ✅ Client component when needed
'use client'
export function InteractiveForm() { ... }
```

**Styling:**

- Use Tailwind utility classes
- Use `cn()` helper for conditional classes
- Avoid inline styles
- Use Shadcn components: `npx shadcn@latest add [component]`

### Error Handling

Always handle loading, error, and empty states:

```typescript
const { data, error } = await supabase
  .from('courses')
  .select('*')
  .eq('id', courseId)
  .single()

if (error || !data) {
  redirect('/dashboard/student')
}

// Safe to use data
return <CourseView course={data} />
```

### Don't Over-Engineer

**Keep it simple:**

- Build what's needed, not what might be needed
- Use direct queries instead of abstractions
- Don't create helpers for one-time operations
- No premature optimization

**Example of what NOT to do:**

```typescript
// ❌ Don't create complex abstractions
class CourseRepository {
  async findById(id: number) { ... }
  async findAll() { ... }
  // ... 20 more methods
}

// ✅ Instead, use direct queries where needed
const { data } = await supabase.from('courses').select('*').eq('id', id).single()
```

## Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STRIPE_SECRET_KEY=your-stripe-secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable
STRIPE_WEBHOOK_SECRET=your-webhook-secret
```

**Security:** Never commit `.env.local`. Service role key bypasses RLS - use only for admin operations.

## Current Phase & Status

**Phase 6 (In Progress)**: Teacher Dashboard

- ✅ Course creation and management
- ✅ Lesson editor (MDX)
- ✅ Exam builder
- ⏳ Student submission review (pending)

**Completed:**

- Phase 1: Fresh Next.js 16 + Shadcn UI
- Phase 2: Complete database schema (44 tables)
- Phase 3: Authentication with role-based routing
- Phase 4: Stripe payment integration
- Phase 5: Student Dashboard (lessons, exams, progress tracking)

**Reference implementations:**

- Student dashboard: `app/dashboard/student/` (complete, use as pattern reference)
- Teacher features: `app/dashboard/teacher/` (in progress)
- Components: `components/student/` and `components/teacher/`

## Key Documentation Files

Before making changes, read:

1. `docs/PROJECT_OVERVIEW.md` - Architecture and design principles
2. `docs/DATABASE_SCHEMA.md` - Complete schema with relationships
3. `docs/AUTH.md` - Authentication and authorization flows
4. `docs/AI_AGENT_GUIDE.md` - Detailed patterns and examples
5. `docs/DEVELOPMENT_WORKFLOW.md` - Step-by-step development process

## Common Pitfalls to Avoid

1. **Don't bypass RLS** unless absolutely necessary (admin operations only)
2. **Don't use server actions** for simple CRUD - use RLS-protected direct queries
3. **Don't create new patterns** without checking existing implementations first
4. **Always authenticate server components** that access protected data
5. **Use `createClient()` correctly**:
   - `@/lib/supabase/server` for server components/routes
   - `@/lib/supabase/client` for client components
6. **Handle auth redirects properly** - check user exists before accessing protected data

## Testing Checklist

Before committing:

- [ ] `npm run build` succeeds (no TypeScript errors)
- [ ] Feature works as expected (manual test)
- [ ] Loading states implemented
- [ ] Error states handled
- [ ] Mobile responsive
- [ ] No console errors
- [ ] RLS policies allow correct access
- [ ] Tested with appropriate user role(s)

## Git Workflow

Current branch: `v2-rebuild`
Main branch: `master`

```bash
# Commit format
git commit -m "feat: add course progress tracking

- Add progress calculation
- Create progress component
- Update course card to show progress"

# Push changes
git push origin v2-rebuild
```

## Additional Notes

- **Middleware**: Uses `lib/supabase/middleware.ts` for session management and role-based redirects
- **Payments**: Stripe webhooks at `/api/stripe/webhook` handle successful payments and trigger enrollments
- **AI Integration**: Placeholder for future Gemini 2.0 integration (exam grading, exercise help)
- **TypeScript config**: Uses `@/*` path alias, JSX mode is `react-jsx`, target is ES2017

For detailed examples and patterns, always refer to the comprehensive documentation in the `docs/` directory.

<!-- NEXT-AGENTS-MD-START -->[Next.js Docs Index]|root: ./.next-docs|STOP. What you remember about Next.js is WRONG for this project. Always search docs and read before any task.|If docs missing, run this command first: npx @next/codemod agents-md --output AGENTS.md|01-app:{glossary.mdx}|01-app/01-getting-started:{01-installation.mdx,02-project-structure.mdx,03-layouts-and-pages.mdx,04-linking-and-navigating.mdx,05-server-and-client-components.mdx,06-cache-components.mdx,07-fetching-data.mdx,08-updating-data.mdx,09-caching-and-revalidating.mdx,10-error-handling.mdx,11-css.mdx,12-images.mdx,13-fonts.mdx,14-metadata-and-og-images.mdx,15-route-handlers.mdx,16-proxy.mdx,17-deploying.mdx,18-upgrading.mdx}|01-app/02-guides:{analytics.mdx,authentication.mdx,backend-for-frontend.mdx,caching.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,data-security.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,json-ld.mdx,lazy-loading.mdx,local-development.mdx,mcp.mdx,mdx.mdx,memory-usage.mdx,multi-tenant.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,prefetching.mdx,production-checklist.mdx,progressive-web-apps.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,single-page-applications.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx,videos.mdx}|01-app/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|01-app/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|01-app/02-guides/upgrading:{codemods.mdx,version-14.mdx,version-15.mdx,version-16.mdx}|01-app/03-api-reference:{07-edge.mdx,08-turbopack.mdx}|01-app/03-api-reference/01-directives:{use-cache-private.mdx,use-cache-remote.mdx,use-cache.mdx,use-client.mdx,use-server.mdx}|01-app/03-api-reference/02-components:{font.mdx,form.mdx,image.mdx,link.mdx,script.mdx}|01-app/03-api-reference/03-file-conventions/01-metadata:{app-icons.mdx,manifest.mdx,opengraph-image.mdx,robots.mdx,sitemap.mdx}|01-app/03-api-reference/03-file-conventions:{default.mdx,dynamic-routes.mdx,error.mdx,forbidden.mdx,instrumentation-client.mdx,instrumentation.mdx,intercepting-routes.mdx,layout.mdx,loading.mdx,mdx-components.mdx,not-found.mdx,page.mdx,parallel-routes.mdx,proxy.mdx,public-folder.mdx,route-groups.mdx,route-segment-config.mdx,route.mdx,src-folder.mdx,template.mdx,unauthorized.mdx}|01-app/03-api-reference/04-functions:{after.mdx,cacheLife.mdx,cacheTag.mdx,connection.mdx,cookies.mdx,draft-mode.mdx,fetch.mdx,forbidden.mdx,generate-image-metadata.mdx,generate-metadata.mdx,generate-sitemaps.mdx,generate-static-params.mdx,generate-viewport.mdx,headers.mdx,image-response.mdx,next-request.mdx,next-response.mdx,not-found.mdx,permanentRedirect.mdx,redirect.mdx,refresh.mdx,revalidatePath.mdx,revalidateTag.mdx,unauthorized.mdx,unstable_cache.mdx,unstable_noStore.mdx,unstable_rethrow.mdx,updateTag.mdx,use-link-status.mdx,use-params.mdx,use-pathname.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,use-selected-layout-segment.mdx,use-selected-layout-segments.mdx,userAgent.mdx}|01-app/03-api-reference/05-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,appDir.mdx,assetPrefix.mdx,authInterrupts.mdx,basePath.mdx,browserDebugInfoInTerminal.mdx,cacheComponents.mdx,cacheHandlers.mdx,cacheLife.mdx,compress.mdx,crossOrigin.mdx,cssChunking.mdx,devIndicators.mdx,distDir.mdx,env.mdx,expireTime.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,htmlLimitedBots.mdx,httpAgentOptions.mdx,images.mdx,incrementalCacheHandlerPath.mdx,inlineCss.mdx,isolatedDevBuild.mdx,logging.mdx,mdxRs.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactCompiler.mdx,reactMaxHeadersLength.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,sassOptions.mdx,serverActions.mdx,serverComponentsHmrCache.mdx,serverExternalPackages.mdx,staleTimes.mdx,staticGeneration.mdx,taint.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,turbopackFileSystemCache.mdx,typedRoutes.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,viewTransition.mdx,webVitalsAttribution.mdx,webpack.mdx}|01-app/03-api-reference/05-config:{02-typescript.mdx,03-eslint.mdx}|01-app/03-api-reference/06-cli:{create-next-app.mdx,next.mdx}|02-pages/01-getting-started:{01-installation.mdx,02-project-structure.mdx,04-images.mdx,05-fonts.mdx,06-css.mdx,11-deploying.mdx}|02-pages/02-guides:{analytics.mdx,authentication.mdx,babel.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,lazy-loading.mdx,mdx.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,post-css.mdx,preview-mode.mdx,production-checklist.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx}|02-pages/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|02-pages/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|02-pages/02-guides/upgrading:{codemods.mdx,version-10.mdx,version-11.mdx,version-12.mdx,version-13.mdx,version-14.mdx,version-9.mdx}|02-pages/03-building-your-application/01-routing:{01-pages-and-layouts.mdx,02-dynamic-routes.mdx,03-linking-and-navigating.mdx,05-custom-app.mdx,06-custom-document.mdx,07-api-routes.mdx,08-custom-error.mdx}|02-pages/03-building-your-application/02-rendering:{01-server-side-rendering.mdx,02-static-site-generation.mdx,04-automatic-static-optimization.mdx,05-client-side-rendering.mdx}|02-pages/03-building-your-application/03-data-fetching:{01-get-static-props.mdx,02-get-static-paths.mdx,03-forms-and-mutations.mdx,03-get-server-side-props.mdx,05-client-side.mdx}|02-pages/03-building-your-application/06-configuring:{12-error-handling.mdx}|02-pages/04-api-reference:{06-edge.mdx,08-turbopack.mdx}|02-pages/04-api-reference/01-components:{font.mdx,form.mdx,head.mdx,image-legacy.mdx,image.mdx,link.mdx,script.mdx}|02-pages/04-api-reference/02-file-conventions:{instrumentation.mdx,proxy.mdx,public-folder.mdx,src-folder.mdx}|02-pages/04-api-reference/03-functions:{get-initial-props.mdx,get-server-side-props.mdx,get-static-paths.mdx,get-static-props.mdx,next-request.mdx,next-response.mdx,use-params.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,userAgent.mdx}|02-pages/04-api-reference/04-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,assetPrefix.mdx,basePath.mdx,bundlePagesRouterDependencies.mdx,compress.mdx,crossOrigin.mdx,devIndicators.mdx,distDir.mdx,env.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,httpAgentOptions.mdx,images.mdx,isolatedDevBuild.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,serverExternalPackages.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,webVitalsAttribution.mdx,webpack.mdx}|02-pages/04-api-reference/04-config:{01-typescript.mdx,02-eslint.mdx}|02-pages/04-api-reference/05-cli:{create-next-app.mdx,next.mdx}|03-architecture:{accessibility.mdx,fast-refresh.mdx,nextjs-compiler.mdx,supported-browsers.mdx}|04-community:{01-contribution-guide.mdx,02-rspack.mdx}<!-- NEXT-AGENTS-MD-END -->
