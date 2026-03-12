# Project Overview

## What is this?

A multi-tenant SaaS Learning Management System. Schools operate as independent tenants on subdomains (`school-slug.platform.com`). Teachers create courses with rich content, students learn with AI assistance, and admins manage billing, users, and analytics. Supports English and Spanish.

## Architecture

```
                    ┌──────────────────┐
                    │    Next.js 16    │
                    │   (App Router)   │
                    └────────┬─────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
 ┌────────▼────────┐ ┌──────▼──────┐ ┌─────────▼─────────┐
 │    Supabase     │ │  AI Services│ │      Stripe       │
 │  PostgreSQL 15  │ │  Vercel AI  │ │  Connect + Billing│
 │  Auth / Storage │ │  OpenAI     │ │                   │
 └─────────────────┘ └─────────────┘ └───────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.5 (App Router, React 19) |
| UI | Shadcn UI (base-mira variant), Tailwind CSS v4 |
| Icons | Tabler Icons, Lucide React |
| Fonts | Noto Sans (body), Geist Sans/Mono (UI/code) |
| Database | Supabase (PostgreSQL 15, 65+ tables) |
| Auth | Supabase Auth with JWT custom claims |
| Storage | Supabase Storage |
| AI | Vercel AI SDK with OpenAI (gpt-5-mini) |
| Payments | Stripe Connect (student payments) + Stripe Billing (school plans) |
| i18n | next-intl (en/es) |
| Landing Pages | Puck v0.20 drag-and-drop visual editor |
| Animations | motion (Framer Motion v12) |
| Testing | Playwright E2E (47 scenarios) |

### Multi-Tenancy

Every request passes through `proxy.ts` (the single middleware), which:
1. Extracts tenant slug from subdomain
2. Resolves tenant ID and injects `x-tenant-id` header
3. Checks `tenant_users` membership
4. Enforces role-based route guards

All database queries use RLS and explicit `tenant_id` filters. The `profiles` table is global (no tenant_id).

## User Roles

| Role | Scope | Description |
|------|-------|-------------|
| Student | Per-tenant | Enrolls in courses, completes lessons, takes exams, earns XP |
| Teacher | Per-tenant | Creates courses, builds lessons/exams, reviews submissions |
| Admin | Per-tenant | Manages users, billing, analytics, landing pages, settings |
| Super Admin | Platform-wide | Manages all tenants, platform plans, impersonation (via `super_admins` table) |

Roles are stored in `tenant_users` (authoritative source). JWT claims include `tenant_role`, `user_role`, `tenant_id`, and `is_super_admin`.

## Key Features

### Content Creation (Teacher)
- **Block Editor** with 22 block types: text, heading, callout, code, quiz, spoiler, steps, vocabulary, definition, image, video, divider, audio, embed, file-download, glossary, comparison, table, flashcard-set, fill-in-the-blank, matching-pairs, ordering
- **Exercise Builder** with 11 exercise types: essay, coding_challenge, quiz, multiple_choice, true_false, fill_in_the_blank, discussion, audio_evaluation, video_evaluation, real_time_conversation, artifact
- **Exam System** with multiple question types and AI-assisted grading
- Sequential lesson completion and lesson resources (attachments)

### Learning Experience (Student)
- Course enrollment (free, paid via Stripe, or manual/offline payment)
- Lesson viewer with progress tracking
- AI-powered exam feedback
- **Aristotle AI Tutor** — context-aware AI assistant with session persistence
- Gamification: XP, levels, streaks, achievements, leaderboard, point store (12 tables)
- **Certificates** with PDF generation and public QR-code verification at `/verify/[code]`

### School Management (Admin)
- User management with role assignment
- **Invitation system** for onboarding users
- Transaction and subscription monitoring
- Revenue dashboard with analytics
- **Landing Page Builder** — Puck v0.20 visual editor with 32 components across 4 categories and 8 built-in templates
- Tenant settings (branding, theme, payment config)
- **Onboarding wizard** for new schools
- **Guided tours** (driver.js)

### Platform (Super Admin)
- Tenant management and oversight
- 5-tier pricing with feature gating (Free, Starter, Pro, Business, Enterprise)
- Platform billing via Stripe Checkout + manual bank transfer
- Referral system, impersonation, platform analytics

### Payments

Two separate Stripe integrations:

| | Student Payments (Connect) | School Billing (Platform) |
|--|--|--|
| Who pays | Student pays school | School admin pays platform |
| Stripe mode | PaymentIntents with Connect | Checkout + Subscriptions |
| Revenue split | Configurable (default 80/20) | Fixed tier pricing |
| Webhook | `/api/stripe/webhook` | `/api/stripe/platform-webhook` |

Manual/offline payment flow: student submits payment request, admin confirms, system enrolls.

### AI Integration
- **Aristotle AI Tutor**: context-aware tutoring with course/lesson context and session persistence
- **Exam grading**: AI-assisted evaluation with detailed feedback
- **Exercise assistance**: real-time AI help across exercise types
- **MCP Server**: 27 tools for AI agent integration with the platform
- Provider: Vercel AI SDK with OpenAI (gpt-5-mini)

### Additional Features
- LATAM payment support (MXN, COP, CLP, PEN, ARS, BRL)
- Notification system with templates and preferences
- Course categories
- Dark/light mode with tenant theme overrides

## Database

65+ tables organized into key groups:

| Group | Key Tables |
|-------|-----------|
| Multi-tenancy | `tenants`, `tenant_users`, `tenant_settings`, `super_admins` |
| Users | `profiles` (global), `user_roles` |
| Content | `courses`, `lessons`, `exercises`, `exams`, `exam_questions`, `question_options` |
| Progress | `enrollments`, `lesson_completions`, `exam_submissions` |
| Commerce | `products`, `plans`, `transactions`, `subscriptions`, `payment_requests` |
| Revenue | `revenue_splits`, `payouts`, `invoices` |
| Platform Billing | `platform_plans`, `platform_subscriptions`, `platform_payment_requests` |
| Gamification | 12 tables (`gamification_profiles`, `xp_transactions`, `levels`, `achievements`, etc.) |
| Certificates | `certificates`, `certificate_templates` |
| Notifications | `notifications`, `user_notifications`, `notification_templates`, `notification_preferences` |
| Landing Pages | `landing_pages` (with `puck_data` JSONB column) |

All tenant-scoped tables use RLS. Direct queries with explicit `tenant_id` filters are preferred over server actions for reads.

## Project Phases (All Complete)

| Phase | Scope | Highlights |
|-------|-------|-----------|
| 1 | Foundation | Next.js 16, Supabase, Shadcn UI (base-mira), Tailwind CSS v4 |
| 2 | Database | 65+ tables, RLS policies, database functions and RPCs |
| 3 | Core LMS | Auth, enrollment, lessons, exams, progress tracking |
| 4 | AI Integration | Vercel AI SDK with OpenAI (gpt-5-mini), Aristotle AI Tutor, exam grading |
| 5 | Gamification | 12 tables: XP, levels, streaks, achievements, leaderboard, point store |
| 6 | Teacher Dashboard | Block editor (22 block types), exercise builder (11 types), exam builder |
| 7 | Admin Dashboard | Monetization, billing, analytics, user management, invitations |
| 8 | i18n | next-intl with English and Spanish |
| 9 | Multi-tenant SaaS | Subdomain routing, RLS, tenant settings, platform super admin panel |
| 10 | Landing Page Builder | Puck v0.20 visual editor, 32 components, 8 templates |

## Deployment

- **Production**: Vercel + Supabase Cloud
- **Development**: Local Supabase + Next.js dev server (`lvh.me:3000` for subdomain testing)
- **CI/CD**: Automatic deployments via Vercel, database migrations via Supabase CLI

## Key Documentation

- `docs/DATABASE_SCHEMA.md` — complete schema with relationships
- `docs/AUTH.md` — authentication flows
- `docs/AI_AGENT_GUIDE.md` — detailed patterns for AI agents
- `docs/MONETIZATION.md` — billing, feature gating, LATAM payments
- `CLAUDE.md` — development guidelines and known pitfalls
