# MVP User Journeys & Feature Map

> Complete reference of all user-facing features in LMS V2, organized by role and user journey. Use this document for demos, investor pitches, and onboarding new team members.
>
> **Business Model:** White-label SaaS — each tenant (school) is an independent academy with its own branding, plans, courses, and student base. Schools can offer one-time course purchases (Products) and/or subscription plans (Plans) with per-plan course access via `plan_courses`. All settings are tenant-scoped via `tenant_settings`.

## Platform at a Glance

| Metric | Count |
|--------|-------|
| User-facing pages | 72 |
| API endpoints | 24 |
| Database tables | 65+ (with full RLS) |
| Languages | 2 (English, Spanish) |
| User roles | 3 (student, teacher, admin) + super admin |
| Gamification achievements | 30 |
| Gamification levels | 15 |

---

## 1. Visitor / Prospective Student

The unauthenticated experience that converts visitors into users.

> **Context-aware:** The experience branches based on which domain the visitor lands on.

### Journey A: Main Platform (`lvh.me` / `yourplatform.com`)

Visitors landing here are prospective **school owners / creators**.

```
Platform Landing → Features / Pricing / For Creators → Create School → Sign Up
```

| Story | Route | Description |
|-------|-------|-------------|
| View platform marketing page | `/` | Hero, AI features, gamification, feature grid, pricing teaser, CTA — targets B2B audience |
| Browse platform pricing | `/platform-pricing` | Plan comparison (Free → Starter → Pro → Business → Enterprise) with feature limits |
| Explore creator features | `/creators` | AI grading showcase, gamification demo, feature comparison |
| Create a school | `/create-school` | Two-step flow: (1) account creation if not logged in, (2) school name + auto-generated slug → creates tenant with creator as admin. Cross-subdomain auth redirects to new school subdomain |
| Sign up (main domain) | `/auth/sign-up` | Email/password registration → confirm email → lands on `/create-school` |
| Login | `/auth/login` | Email/password with redirect to role-based dashboard |

**Navbar on main domain:** Features · Pricing · For Creators | Log In · **Start Free →** (→ `/create-school`)

### Journey B: School Subdomain (`myschool.platform.com`)

Visitors landing here are prospective **students** of a specific school.

```
School Landing → Browse Courses → Join School → Confirm Email → Join Flow
```

| Story | Route | Description |
|-------|-------|-------------|
| View school landing page | `/` on school subdomain | School logo, name, "Join [School]" CTA, published courses grid, join CTA strip — uses school's `primary_color`. Optionally a Puck-built custom landing page |
| Browse school's courses | `/courses` | All published courses for that school |
| View course details | `/courses/[id]` | Lesson list, pricing card, enrollment button |
| Compare school's plans | `/pricing` | Per-school subscription plans |
| Sign up on subdomain | `/auth/sign-up?next=/join-school` | Registration → confirm email → lands on `/join-school` for that school |
| Join school via invitation | `/join-school` | Authenticated users join the school's `tenant_users` as student (or role from invite). Non-members are auto-redirected here by proxy middleware |
| Login | `/auth/login` | Email/password with redirect to role-based dashboard |
| Reset password | `/auth/forgot-password` | Email-based password reset flow |

**Navbar on school subdomain:** Courses · About | Log In · **Join [School Name]** (→ `/auth/sign-up?next=/join-school`)

### Journey C: School Creation & Onboarding

```
Create School → Auto-redirect to Subdomain → Onboarding Wizard → Configure School → Start Teaching
```

| Story | Route | Description |
|-------|-------|-------------|
| Create school account | `/create-school` (main domain) | Two-step: sign up (if needed) → name school → auto-slug generated → tenant created |
| Cross-subdomain auth | Automatic | After school creation, auth token is transferred to the new school subdomain seamlessly |
| Onboarding wizard | `/dashboard/admin` (first visit) | Guided setup: school branding, connect Stripe, create first course, invite team members |
| Invite team members | `/dashboard/admin/users` | Send email invitations with role assignment (teacher or admin) |

---

## 2. Student

The core learning experience after authentication.

### Journey A: Dashboard & Course Discovery

```
Login → Dashboard → Browse Courses → Enroll → Start Learning
```

| Story | Route | Description |
|-------|-------|-------------|
| See personalized dashboard | `/dashboard/student` | Welcome hero, progress stats (lessons studied, courses in progress, completed), course cards, upcoming exams, recent activity, mini leaderboard |
| Guided tour (first visit) | `/dashboard/student` | Auto-starting guided tour (driver.js) on first visit, highlights key UI areas |
| Browse all available courses | `/dashboard/student/browse` | All published courses, enrollment status badges, subscription prompt if needed |
| View "My Courses" with filters | `/dashboard/student/courses` | Filter by status (in progress, completed, not started), search, sort |
| Purchase a single course | `/checkout?courseId=X` | Stripe checkout → auto-enrollment on payment success |
| Subscribe to a plan | `/checkout?planId=X` | Stripe checkout → subscription created → browse and enroll in courses |

### Journey B: Learning a Course

```
Open Course → Study Lesson → Mark Complete → Take Exam → Get AI Feedback
```

| Story | Route | Description |
|-------|-------|-------------|
| View course overview | `.../courses/[id]` | Curriculum list with progress bar, lesson completion checkmarks, exam link, review section |
| Study a lesson | `.../lessons/[id]` | YouTube video embed, rendered block editor content (22 block types: headings, code blocks, callouts, images, dividers, etc.), sidebar lesson navigator |
| View lesson resources | `.../lessons/[id]` | Downloadable attachments (PDFs, files) attached to each lesson by the teacher |
| Mark lesson as complete/uncomplete | `.../lessons/[id]` | Toggle button, progress updates in real-time. Sequential completion enforced if enabled by teacher |
| Navigate between lessons | `.../lessons/[id]` | Previous/Next buttons, sidebar lesson list. Locked lessons shown when sequential completion is on |
| Comment on a lesson | `.../lessons/[id]` | Threaded comments with reactions (like, dislike, funny, boring) |
| Ask Aristotle AI Tutor | `.../lessons/[id]` | Floating AI panel — context-aware tutor that answers questions about the current lesson content |
| Take an exam | `.../exams/[id]` | Multiple question types, timed or untimed |
| View exam results with AI feedback | `.../exams/[id]/result` | Score, per-question AI feedback, overall feedback |
| Review exam answers | `.../exams/[id]/review` | Side-by-side answers vs correct answers with explanations |
| Complete an AI exercise | `.../exercises/[id]` | Interactive chat with AI tutor, real-time guidance |
| Complete an artifact exercise | `.../exercises/[id]` | Build HTML/CSS/JS artifacts in a sandbox, evaluated by AI against rubric |
| Complete a voice/audio exercise | `.../exercises/[id]` | Record audio for AI speech evaluation (pronunciation, fluency, content) |
| Leave a course review | `.../courses/[id]` | 1-5 star rating with optional written review |

### Journey C: Gamification & Rewards

```
Complete Lessons → Earn XP → Level Up → Unlock Achievements → Spend Coins
```

| Story | Route | Description |
|-------|-------|-------------|
| See gamification stats | Dashboard header | Level, XP progress bar, daily streak counter, coin balance |
| View achievements | `/dashboard/student/profile#achievements` | 30 achievements across categories (learning, social, streaks) |
| Check leaderboard | Dashboard widget | Ranked student leaderboard with XP totals |
| Browse and buy rewards | `/dashboard/student/store` | 8 store items purchasable with earned coins |
| Maintain daily streak | Automatic | Tracked via `update_streak()` RPC, streak bonuses exempt from daily XP cap |

### Journey D: Profile & Certificates

| Story | Route | Description |
|-------|-------|-------------|
| View and edit profile | `/dashboard/student/profile` | Avatar, full name, bio, account details |
| View billing history | `/dashboard/student/profile` | Transaction table with amounts, dates, statuses |
| View subscription status | `/dashboard/student/profile` | Active plan, renewal date, upgrade options |
| View earned certificates | `/dashboard/student/profile` | List of certificates with download and share links |
| Download certificate PDF | `/api/certificates/[id]` | Generated PDF with course name, student name, completion date |
| Share certificate | Public link | Shareable URL for professional profiles |
| Verify a certificate | `/verify/[code]` | Public verification page with certificate details and validity status |
| Read notifications | `/dashboard/notifications` | Notification center with read/unread states |

---

## 3. Teacher / Course Creator

The content creation and student management experience.

### Journey A: Create & Publish a Course

```
Dashboard → Create Course → Add Lessons → Create Exam → Publish
```

| Story | Route | Description |
|-------|-------|-------------|
| View teacher dashboard | `/dashboard/teacher` | Stats cards (total courses, active students, submissions), course list, recent activity, growth tips |
| View all my courses | `/dashboard/teacher/courses` | Grid with thumbnails, status badges, student/lesson/exam counts, search and filter |
| Create a new course | `.../courses/new` | Title, description, thumbnail URL, category dropdown, sequential completion toggle, status (draft by default) |
| Edit course settings | `.../courses/[id]/settings` | Update title, description, category, thumbnail, sequential completion, status |
| Preview course as student | `.../courses/[id]` | Course preview mode — see the course exactly as a student would |
| Add a lesson | `.../lessons/new` | Block editor with 22 block types (paragraph, headings, code, callout, image, divider, video, table, etc.), video URL, sequence ordering, publish status |
| Edit a lesson | `.../lessons/[id]` | Full block editor with live preview |
| Manage lesson resources | `.../lessons/[id]` | Upload, reorder, and delete file attachments (PDFs, documents) for student download |
| Create an exam | `.../exams/new` | Question builder with multiple types, options editor, scoring config |
| Edit an exam | `.../exams/[id]` | Modify questions, reorder, update scoring |
| Create an exercise | `.../exercises/new` | AI-powered exercise with prompt configuration. Types: chat, artifact (HTML/CSS/JS), voice/audio |
| Publish a course | Course settings | Draft → Published (visible to students) → Archived |

### Journey B: Review Student Work

```
View Submissions → See AI Grade → Override Score → Issue Certificate
```

| Story | Route | Description |
|-------|-------|-------------|
| View exam submissions | `.../exams/[id]/submissions` | List of student submissions with scores, dates, status |
| Review a submission | `.../submissions/[id]` | Student answers with AI-generated feedback and score |
| Override AI score | `.../submissions/[id]` | Manually adjust score with override reason |
| Configure certificate template | `.../certificates/settings` | Design certificate for course completion |
| Issue certificate to student | API endpoint | Generate and deliver certificate on course completion |

### Journey C: AI Tools & Templates

| Story | Route | Description |
|-------|-------|-------------|
| Manage prompt templates | `/dashboard/teacher/templates` | List of reusable AI prompts for grading and exercises |
| Create a prompt template | `.../templates/new` | Template editor with variables and preview |
| Edit a prompt template | `.../templates/[id]/edit` | Modify existing templates |
| Use exercise templates | `.../exercises/new` | Pre-built prompt templates for common AI grading scenarios |
| Preview exercise as student | API preview endpoint | Test how students will experience the AI exercise |
| Trigger AI exam grading | API grade endpoint | Auto-grade open-ended answers with AI feedback |

### Journey D: Landing Page Builder

```
Open Puck Editor → Choose Template → Customize Components → Publish Landing Page
```

| Story | Route | Description |
|-------|-------|-------------|
| Create/edit landing page | `/dashboard/admin/landing-pages` | Puck visual drag-and-drop editor with 32 components across 4 categories (primitives, layout, LMS, navigation) |
| Choose from templates | Puck editor | 8 built-in templates: Blank, Modern Academy, Minimal, Bold Creator, Course Catalog, About, Contact, FAQ |
| Upload assets | Puck editor | Image upload to `landing-page-assets` Supabase bucket |
| Preview and publish | Puck editor | Live preview and publish to school's landing page |

---

## 4. Admin / Platform Owner

Full platform management and configuration.

### Journey A: Platform Overview & Analytics

```
Login → Dashboard → View Stats → Check Analytics → Manage Revenue
```

| Story | Route | Description |
|-------|-------|-------------|
| View admin dashboard | `/dashboard/admin` | Stats cards (total users, active subscriptions, courses, pending payments, total revenue), quick actions grid, recent users and transactions |
| View detailed analytics | `/dashboard/admin/analytics` | Platform-wide metrics and trends |
| View monetization dashboard | `/dashboard/admin/monetization` | Revenue overview, transaction volume, subscription metrics |
| View revenue analytics | `/dashboard/admin/analytics` | Revenue charts with time-series data, breakdowns by product/plan |
| View all transactions | `/dashboard/admin/transactions` | Payment history with amounts, statuses, dates |
| Handle payment requests | `/dashboard/admin/payment-requests` | Manual payment approval/rejection workflow |

### Journey B: User & Content Management

| Story | Route | Description |
|-------|-------|-------------|
| Manage users | `/dashboard/admin/users` | Search, filter, view user details, edit roles |
| View user detail | `/dashboard/admin/users/[id]` | Profile, enrollments, transactions, activity |
| Invite users | `/dashboard/admin/users` | Send email invitations with role assignment (student, teacher, admin) |
| Manage all courses | `/dashboard/admin/courses` | Platform-wide course list with status management |
| Manage enrollments | `/dashboard/admin/enrollments` | View and manage student-course enrollments |
| Manage categories | `/dashboard/admin/categories` | Create, edit, delete course categories |

### Journey C: Commerce & Subscriptions

| Story | Route | Description |
|-------|-------|-------------|
| Create products | `/dashboard/admin/products/new` | Link courses to purchasable products with pricing |
| Edit products | `/dashboard/admin/products/[id]/edit` | Update product details, pricing, status |
| Create subscription plans | `/dashboard/admin/plans/new` | Free/pro/enterprise tiers with course bundles |
| Edit plans | `/dashboard/admin/plans/[id]/edit` | Update plan pricing, courses, features |
| View active subscriptions | `/dashboard/admin/subscriptions` | All active subscriber list |

### Journey D: Billing & Plan Management

| Story | Route | Description |
|-------|-------|-------------|
| View current plan | `/dashboard/admin/billing` | Current platform plan, usage vs limits (courses, students, transaction fees) |
| Upgrade/downgrade plan | `/dashboard/admin/billing` | Plan comparison with upgrade/downgrade flow via Stripe Billing |
| View billing history | `/dashboard/admin/billing` | Invoice history, payment method management |
| Manage API tokens | `/dashboard/admin/settings` | Generate and manage API tokens for MCP server integration |

### Journey E: Platform Configuration

| Story | Route | Description |
|-------|-------|-------------|
| General settings | `/dashboard/admin/settings` (General tab) | Site name, description, contact email, timezone, maintenance mode |
| Branding settings | `/dashboard/admin/settings` (Branding tab) | Logo, colors, brand customization |
| Email settings | `/dashboard/admin/settings` (Email tab) | SMTP configuration, sender details |
| Payment settings | `/dashboard/admin/settings` (Payment tab) | Stripe keys, currency, payment methods |
| Enrollment settings | `/dashboard/admin/settings` (Enrollment tab) | Auto-enrollment rules, capacity limits |
| Manage notifications | `/dashboard/admin/notifications` | Send platform notifications |
| Edit email templates | `.../notifications/templates` | Customize notification email templates |

---

## 5. Super Admin (Platform-Level)

Platform-wide management for super administrators.

### Journey: Platform Operations

```
Login → Super Admin Panel → Manage Tenants → Monitor Platform → Handle Billing
```

| Story | Route | Description |
|-------|-------|-------------|
| View platform dashboard | `/platform/` | Platform-wide stats via `get_platform_stats()` RPC: total tenants, users, revenue |
| Manage all tenants | `/platform/tenants` | View all schools, member counts, status, plans, creation dates |
| View tenant detail | `/platform/tenants/[id]` | School details, members, courses, revenue, plan info |
| Manage platform plans | `/platform/plans` | Edit plan limits (courses, students, transaction fees) in `platform_plans` |
| Handle platform payment requests | `/platform/payment-requests` | Approve/reject manual payment requests for school plan subscriptions |
| Manage referral codes | `/platform/referrals` | Create and manage referral codes with `referral_codes` / `referral_redemptions` tables |
| Impersonate user | `/platform/impersonate` | Impersonate any user for debugging (logged in `impersonation_log`) |
| Data isolation enforced at DB level | RLS policies | `tenant_id = auth.tenant_id() OR auth.is_super_admin()` on all tables |

---

## 6. Payment Flows

| Flow | Steps | Mechanism |
|------|-------|-----------|
| **Buy single course** | Browse → Checkout → Stripe payment → Auto-enrollment | `trigger_manage_transactions` calls `enroll_user()` on successful payment |
| **Subscribe to plan** | Pricing → Checkout → Stripe payment → Subscription created → Browse & enroll | `handle_new_subscription()` creates subscription, student manually enrolls from browse |
| **Manual payment** | Products page → Submit request → Admin approves → Enrollment | Admin payment-requests dashboard |
| **Stripe Connect** (multi-tenant) | School admin connects Stripe → Payments route to school account | `transfer_data.destination` with platform `application_fee_amount` |
| **Platform billing** (school plans) | Admin selects plan → Stripe Billing checkout → Plan activated | Webhook at `/api/stripe/platform-webhook` handles subscription lifecycle |

---

## 7. AI-Powered Features

| Feature | How It Works | Trigger |
|---------|-------------|---------|
| **Exam auto-grading** | AI grades open-ended answers, provides per-question feedback and overall score | Teacher triggers via `/api/teacher/exams/[id]/grade` |
| **Exercise AI tutor** | Students chat with AI during exercises for real-time guidance | Student opens exercise, AI responds via `/api/chat/exercises/student/` |
| **Aristotle AI Tutor** | Floating AI panel on lesson pages — context-aware tutor that answers questions about current lesson content | Student opens panel while studying a lesson |
| **Artifact exercises** | Students build HTML/CSS/JS artifacts in a sandbox, AI evaluates against rubric | Student submits artifact, AI grades code quality and correctness |
| **Voice/audio exercises** | Students record audio, AI evaluates speech (pronunciation, fluency, content) | Student records and submits audio clip |
| **Lesson task assistant** | AI helps students complete lesson-embedded tasks | `/api/chat/lesson-task/` |
| **Prompt templates** | Teachers create reusable prompts that control AI grading behavior | CRUD at `/dashboard/teacher/templates` |
| **Score override** | Teachers review and manually adjust AI-generated scores | Submission detail page with override form |

---

## 8. MCP Server Integration

AI agents can manage school content programmatically via the MCP (Model Context Protocol) server.

| Feature | Details |
|---------|---------|
| **Total tools** | 27 tools for content management |
| **Authentication** | API token-based auth, tokens managed via admin settings |
| **Course management** | Create, update, list, and delete courses |
| **Lesson management** | Create, update, list, delete, and reorder lessons |
| **Exam management** | Create and manage exams, questions, and options |
| **Exercise management** | Create and manage AI-powered exercises |
| **Enrollment management** | View and manage student enrollments |
| **Analytics** | Read course progress, completion rates, submission stats |

---

## 9. Gamification System

| Feature | Details |
|---------|---------|
| **XP system** | Earn XP for: completing lessons, submitting exams, finishing exercises, posting comments, receiving reactions, writing reviews |
| **15 levels** | Progressive level-up system with increasing XP thresholds |
| **30 achievements** | Categories: learning milestones, social engagement, streak records, course completions |
| **Daily streak** | Consecutive days of learning activity, with streak bonus XP (exempt from daily cap) |
| **Leaderboard** | Ranked by total XP, refreshed via `refresh_leaderboard_cache()` |
| **Coins & store** | Coins = floor(total_xp / 10) - spent. 8 store items (profile customizations, bonus content) |
| **Daily XP cap** | 1,000 XP/day (streak, achievement, and challenge bonuses exempt) |
| **Dashboard widget** | Level badge, XP bar, streak flame, coin count visible across all student pages |

---

## 10. Internationalization

| Feature | Details |
|---------|---------|
| Supported languages | English (`en`), Spanish (`es`) |
| Implementation | `next-intl` with `[locale]` route prefix |
| Switching | Language toggle in navbar and dashboard header |
| Coverage | All UI text, form labels, error messages, navigation |

---

## 11. Security & Access Control

| Layer | Implementation |
|-------|---------------|
| Authentication | Supabase Auth with JWT, email/password |
| Authorization | JWT claims inject `user_role`, `tenant_role`, `tenant_id`, `is_super_admin` |
| Row-Level Security | All 65+ tables have RLS policies scoped by `tenant_id` |
| Role-based routing | Middleware redirects to role-appropriate dashboard |
| Multi-tenant isolation | Data isolation at database level, not application level |
| Super admin verification | `isSuperAdmin()` queries `super_admins` table directly (does not trust JWT) |
| Stripe webhook security | Signature verification on all webhook events |
| API token auth | Token-based authentication for MCP server integration |

---

## Demo Scripts

### Demo 1: Student Experience (5 min)

1. Open school landing page → show branding and Puck-built custom page
2. Browse course catalog → filter and search
3. Sign up as new student → guided tour auto-starts
4. Dashboard → show stats and gamification widget
5. Open course → study lesson with video + block editor content
6. Ask Aristotle AI Tutor a question about the lesson
7. Mark lesson complete → show XP earned → show sequential unlock
8. Complete an artifact exercise → show AI evaluation
9. Take exam → show AI-graded feedback
10. Show certificate, leaderboard, and downloadable lesson resources

### Demo 2: Teacher Experience (5 min)

1. Login as teacher → show dashboard stats
2. Create new course → enable sequential completion
3. Add a lesson with block editor (22 block types) + upload resources
4. Create exam with questions
5. Create an artifact exercise with AI grading rubric
6. Publish course → preview as student
7. Show student submissions with AI grades
8. Override a score
9. Open Puck landing page builder → choose template → customize → publish

### Demo 3: Multi-Tenant SaaS (3 min)

1. Visit `lvh.me:3000/en` → show platform marketing page with "Start Free →" CTA
2. Create a new school via `/create-school` → two-step flow with auto-slug
3. Auto-redirect to new school subdomain with cross-subdomain auth
4. Onboarding wizard → configure branding, connect Stripe
5. Visit `myschool.lvh.me:3000/en` → show school landing page (school logo, courses grid, school colors)
6. Show context-aware navbar: main domain shows Features/Pricing/Creators; school shows Courses/About + "Join [School]"
7. Sign up on school subdomain → confirm email → lands on `/join-school`
8. Show Stripe Connect flow for school payments

### Demo 4: Admin Platform Management (3 min)

1. Login as admin → show revenue and user stats
2. Invite users via email with role assignment
3. Show monetization dashboard and revenue analytics charts
4. Manage billing → show current plan, usage limits, upgrade flow
5. Create a product linked to a course
6. Show platform settings (branding, email, payments, API tokens)
7. Show notification management

### Demo 5: Super Admin & MCP (2 min)

1. Login as super admin → navigate to `/platform/`
2. Show platform stats: total tenants, users, revenue
3. Manage tenants → view school details and plan info
4. Show referral code management
5. Demo MCP server: AI agent creates a course with lessons via API tokens
