# MVP User Journeys & Feature Map

> Complete reference of all user-facing features in LMS V2, organized by role and user journey. Use this document for demos, investor pitches, and onboarding new team members.
>
> **Business Model:** White-label SaaS — each tenant (school) is an independent academy with its own branding, plans, courses, and student base. Schools can offer one-time course purchases (Products) and/or subscription plans (Plans) with per-plan course access via `plan_courses`. All settings are tenant-scoped via `tenant_settings`.

## Platform at a Glance

| Metric | Count |
|--------|-------|
| User-facing pages | 72 |
| API endpoints | 24 |
| Database tables | 56 (with full RLS) |
| Languages | 2 (English, Spanish) |
| User roles | 3 (student, teacher, admin) + super admin |
| Gamification achievements | 30 |
| Gamification levels | 15 |

---

## 1. Visitor / Prospective Student

The unauthenticated experience that converts visitors into users.

### Journey: Discovery to Sign-Up

```
Landing Page → Browse Courses → View Course Detail → See Pricing → Sign Up
```

| Story | Route | Description |
|-------|-------|-------------|
| View landing page with platform branding | `/` | Hero section, feature cards, stats, social proof, CTA buttons |
| Browse public course catalog | `/courses` | Search, category filters, sort options, grid/list toggle, pagination |
| View course details | `/courses/[id]` | Lesson list, instructor info, pricing card, enrollment button, reviews |
| Compare subscription plans | `/pricing` | Per-school plans (no hardcoded free tier), feature comparison, FAQ accordion |
| Read about the platform | `/about` | Mission, values, company stats, team |
| Explore creator features | `/creators` | AI grading showcase, gamification demo, feature comparison, creator pricing |
| Sign up | `/auth/sign-up` | Email/password registration with email confirmation |
| Login | `/auth/login` | Email/password with redirect to role-based dashboard |
| Reset password | `/auth/forgot-password` | Email-based password reset flow |

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
| Study a lesson | `.../lessons/[id]` | YouTube video embed, rendered MDX content (headings, code blocks with copy button, lists), sidebar lesson navigator |
| Mark lesson as complete/uncomplete | `.../lessons/[id]` | Toggle button, progress updates in real-time |
| Navigate between lessons | `.../lessons/[id]` | Previous/Next buttons, sidebar lesson list |
| Comment on a lesson | `.../lessons/[id]` | Threaded comments with reactions (like, dislike, funny, boring) |
| Take an exam | `.../exams/[id]` | Multiple question types, timed or untimed |
| View exam results with AI feedback | `.../exams/[id]/result` | Score, per-question AI feedback, overall feedback |
| Review exam answers | `.../exams/[id]/review` | Side-by-side answers vs correct answers with explanations |
| Complete an AI exercise | `.../exercises/[id]` | Interactive chat with AI tutor, real-time guidance |
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
| Create a new course | `.../courses/new` | Title, description, thumbnail URL, category dropdown, status (draft by default) |
| Edit course settings | `.../courses/[id]/settings` | Update title, description, category, thumbnail, status |
| Add a lesson | `.../lessons/new` | MDX editor, video URL, sequence ordering, publish status |
| Edit a lesson | `.../lessons/[id]` | Full MDX editor with preview |
| Create an exam | `.../exams/new` | Question builder with multiple types, options editor, scoring config |
| Edit an exam | `.../exams/[id]` | Modify questions, reorder, update scoring |
| Create an exercise | `.../exercises/new` | AI-powered exercise with prompt configuration |
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
| Preview exercise as student | API preview endpoint | Test how students will experience the AI exercise |
| Trigger AI exam grading | API grade endpoint | Auto-grade open-ended answers with AI feedback |

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
| View all transactions | `/dashboard/admin/transactions` | Payment history with amounts, statuses, dates |
| Handle payment requests | `/dashboard/admin/payment-requests` | Manual payment approval/rejection workflow |

### Journey B: User & Content Management

| Story | Route | Description |
|-------|-------|-------------|
| Manage users | `/dashboard/admin/users` | Search, filter, view user details, edit roles |
| View user detail | `/dashboard/admin/users/[id]` | Profile, enrollments, transactions, activity |
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

### Journey D: Platform Configuration

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

## 5. Multi-Tenancy / SaaS

The white-label school creation system.

### Journey: Create and Operate a School

```
Create School → Configure Branding → Connect Stripe → Create Courses → Students Enroll
```

| Story | Route | Description |
|-------|-------|-------------|
| Create a new school | `/create-school` | Name + slug form, creates tenant with creator as admin |
| School gets its own isolated data | Automatic | All courses, enrollments, transactions scoped by `tenant_id` via RLS |
| School has branded navbar | Navbar | Logo, school name, custom colors from tenant settings |
| Users switch between schools | TenantSwitcher dropdown | Dropdown in navbar for multi-school users |
| School admin connects Stripe | `/api/stripe/connect` | Stripe Connect onboarding, payments route to school's account |
| Subdomain routing | `school.platform.com` | Each school gets its own subdomain (configurable via `NEXT_PUBLIC_PLATFORM_DOMAIN`) |
| Super admin manages all tenants | `/dashboard/admin/tenants` | View all schools, member counts, status, plans |
| Data isolation enforced at DB level | RLS policies | `tenant_id = auth.tenant_id() OR auth.is_super_admin()` on all tables |

---

## 6. Payment Flows

| Flow | Steps | Mechanism |
|------|-------|-----------|
| **Buy single course** | Browse → Checkout → Stripe payment → Auto-enrollment | `trigger_manage_transactions` calls `enroll_user()` on successful payment |
| **Subscribe to plan** | Pricing → Checkout → Stripe payment → Subscription created → Browse & enroll | `handle_new_subscription()` creates subscription, student manually enrolls from browse |
| **Manual payment** | Products page → Submit request → Admin approves → Enrollment | Admin payment-requests dashboard |
| **Stripe Connect** (multi-tenant) | School admin connects Stripe → Payments route to school account | `transfer_data.destination` with platform `application_fee_amount` |

---

## 7. AI-Powered Features

| Feature | How It Works | Trigger |
|---------|-------------|---------|
| **Exam auto-grading** | AI grades open-ended answers, provides per-question feedback and overall score | Teacher triggers via `/api/teacher/exams/[id]/grade` |
| **Exercise AI tutor** | Students chat with AI during exercises for real-time guidance | Student opens exercise, AI responds via `/api/chat/exercises/student/` |
| **Lesson task assistant** | AI helps students complete lesson-embedded tasks | `/api/chat/lesson-task/` |
| **Prompt templates** | Teachers create reusable prompts that control AI grading behavior | CRUD at `/dashboard/teacher/templates` |
| **Score override** | Teachers review and manually adjust AI-generated scores | Submission detail page with override form |

---

## 8. Gamification System

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

## 9. Internationalization

| Feature | Details |
|---------|---------|
| Supported languages | English (`en`), Spanish (`es`) |
| Implementation | `next-intl` with `[locale]` route prefix |
| Switching | Language toggle in navbar and dashboard header |
| Coverage | All UI text, form labels, error messages, navigation |

---

## 10. Security & Access Control

| Layer | Implementation |
|-------|---------------|
| Authentication | Supabase Auth with JWT, email/password |
| Authorization | JWT claims inject `user_role`, `tenant_role`, `tenant_id`, `is_super_admin` |
| Row-Level Security | All 56 tables have RLS policies scoped by `tenant_id` |
| Role-based routing | Middleware redirects to role-appropriate dashboard |
| Multi-tenant isolation | Data isolation at database level, not application level |
| Stripe webhook security | Signature verification on all webhook events |

---

## Demo Scripts

### Demo 1: Student Experience (5 min)

1. Open landing page → show branding and features
2. Browse course catalog → filter and search
3. Sign up as new student
4. Dashboard → show stats and gamification widget
5. Open course → study lesson with video + MDX
6. Mark lesson complete → show XP earned
7. Take exam → show AI-graded feedback
8. Show certificate and leaderboard

### Demo 2: Teacher Experience (5 min)

1. Login as teacher → show dashboard stats
2. Create new course → fill form
3. Add a lesson with MDX content and video
4. Create exam with questions
5. Publish course
6. Show student submissions with AI grades
7. Override a score
8. Show prompt templates

### Demo 3: Multi-Tenant SaaS (3 min)

1. Create a new school via `/create-school`
2. Show school appears in tenant management
3. Create a course in the new school
4. Login as student → show course is NOT visible (different tenant)
5. Show branded navbar with school name
6. Show Stripe Connect flow for school payments

### Demo 4: Admin Platform Management (3 min)

1. Login as admin → show revenue and user stats
2. Manage users → view details
3. Create a subscription plan
4. Create a product linked to a course
5. Show platform settings (branding, email, payments)
6. Show notification management
