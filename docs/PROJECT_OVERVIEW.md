# Project Overview

## 🎓 What is LMS V2?

LMS V2 is a modern, AI-powered Learning Management System built from the ground up with exceptional user experience as the top priority. It enables teachers to easily create and manage educational content while providing students with an intuitive, engaging learning experience.

## 🎯 Project Goals

### Primary Goals
1. **Exceptional Student UX** - Make learning simple, engaging, and effective
2. **Simple Teacher Tools** - Enable teachers to create content without friction
3. **AI-Powered Learning** - Leverage AI for personalized learning and automated grading
4. **Modern Tech Stack** - Built with Next.js 16, Supabase, and modern best practices

### Non-Goals
- Not a MOOC platform (not designed for massive scale)
- Not a live classroom tool (focus on self-paced learning)
- Not a learning analytics platform (basic analytics only)

## 🏛️ Architecture

### High-Level Architecture

```
┌─────────────┐
│   Next.js   │ ← Frontend + API Routes
│   App 16    │
└──────┬──────┘
       │
       ├─────────────┐
       │             │
┌──────▼──────┐ ┌───▼────────┐
│  Supabase   │ │ AI Services│
│  (Database) │ │  (Gemini)  │
│  (Auth)     │ │            │
│  (Storage)  │ │            │
└─────────────┘ └────────────┘
```

### Technology Stack

**Frontend**
- **Framework**: Next.js 16.1.5 (App Router, React 19)
- **UI Library**: Shadcn UI (base-mira theme)
- **Styling**: Tailwind CSS v4
- **Icons**: Tabler Icons
- **Fonts**: Noto Sans (UI), Geist Mono (code)

**Backend**
- **Database**: Supabase (PostgreSQL 15)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage
- **API**: Next.js API Routes + Supabase Direct Queries (via RLS)

**AI Integration**
- **Provider**: Google Gemini 2.0 (primary)
- **Use Cases**: Exam grading, exercise assistance, content suggestions

**Payments**
- **Provider**: Stripe
- **Features**: One-time purchases, subscriptions, automatic enrollment

## 👥 User Roles

### Student
- Browse and enroll in courses
- Complete lessons and exercises
- Take exams with AI feedback
- Track learning progress
- Get AI assistance with exercises

### Teacher
- Create and manage courses
- Write lessons (MDX format)
- Build exams with multiple question types
- Review student submissions (AI-assisted)
- Track student progress

### Admin
- Manage all courses and users
- Approve/reject course publications
- Monitor transactions and subscriptions
- Assign roles to users
- View system analytics

## 🔄 User Flows

### Student Learning Flow
```
1. Browse Courses
   ↓
2. Enroll (free or paid)
   ↓
3. View Course → Select Lesson
   ↓
4. Read Lesson Content
   ↓
5. Complete Lesson (mark as done)
   ↓
6. (Optional) Get AI Help with Exercise
   ↓
7. Take Exam
   ↓
8. Receive AI Feedback
   ↓
9. Move to Next Lesson
```

### Teacher Content Creation Flow
```
1. Create Course (title, description, image)
   ↓
2. Add Lessons (MDX editor)
   ↓
3. (Optional) Add Exercises with AI evaluation
   ↓
4. Create Exam (questions + auto-grading rules)
   ↓
5. Publish Course
   ↓
6. Review Student Submissions (AI-assisted)
```

## 🗄️ Database Philosophy

### Direct Queries via RLS (Preferred)
Instead of server actions for every CRUD operation, we use **Row Level Security (RLS)** policies to control data access directly from the client:

```typescript
// ✅ GOOD: Direct query with RLS protection
const { data } = await supabase
  .from('courses')
  .select('*')
  .eq('id', courseId)
  .single()
```

```typescript
// ❌ AVOID: Server actions for simple CRUD
// Only use server actions for complex business logic
```

### When to Use Server Actions
- Complex multi-step operations (e.g., payment processing)
- Operations requiring service role permissions
- Operations that need to interact with external APIs
- Business logic that shouldn't be exposed to client

### When to Use Database Functions
- Reusable business logic (e.g., `enroll_user()`)
- Triggers (e.g., auto-create profile on signup)
- Complex queries that need to be consistent
- Operations that modify multiple tables atomically

## 🎨 Design Principles

### UX Principles
1. **Simplicity First** - Remove unnecessary complexity
2. **Visual Feedback** - Users always know what's happening
3. **Progressive Disclosure** - Show what's needed, hide what's not
4. **Consistency** - Similar actions work the same way everywhere

### Code Principles
1. **No Over-Engineering** - Build what's needed, not what might be needed
2. **Type Safety** - Use TypeScript properly
3. **Direct Queries** - Use RLS instead of server actions when possible
4. **Reusable Components** - DRY, but don't abstract too early

## 📊 Key Metrics

### Success Metrics
- **Student Engagement**: Lesson completion rate
- **Teacher Satisfaction**: Time to create a course
- **Learning Outcomes**: Exam pass rates
- **Platform Health**: Active users, course enrollments

## 🔐 Security

### Authentication
- Supabase Auth with email/password
- JWT tokens with role claims
- Automatic profile creation on signup

### Authorization
- Role-based access control (student, teacher, admin)
- Row Level Security on all tables
- Route protection via Next.js middleware

### Data Protection
- No sensitive data in client code
- Environment variables for secrets
- Supabase service role key for admin operations only

## 🚀 Deployment

### Environments
- **Development**: Local Supabase + Next.js dev server
- **Production**: Vercel + Supabase Cloud

### CI/CD
- Automatic deployments on push to main (Vercel)
- Database migrations via Supabase CLI
- Environment variables managed in Vercel

## 📈 Project Phases & Status

### Phase 1 - Fresh Setup ✅
- Next.js 16 + Shadcn UI (Lyra theme)
- Tailwind CSS v4 with @theme syntax
- Tabler Icons + JetBrains Mono font

### Phase 2 - Database Setup ✅
- Supabase connection
- Complete schema (44 tables)
- Database functions preserved

### Phase 3 - Authentication ✅
- Supabase Auth with email/password
- JWT role claims (`custom_access_token_hook`)
- Role-based routing via proxy.ts
- Protected dashboard routes

### Phase 4 - Stripe Integration ✅
- Payment intent creation
- Webhook handling
- Automatic enrollment via triggers

### Phase 5 - Student Dashboard ✅
- Main dashboard with enrolled courses
- Course overview with progress tracking
- Lesson viewer (markdown, video, navigation)
- Lesson completion tracking
- Exam system (take exam, submit, review results)

### Phase 6 - Teacher Dashboard 🔄 (Next)
- Course creation and management
- Lesson editor (MDX)
- Exam builder
- Student submission review

### Phase 7 - Admin Dashboard (Pending)
- User management
- Course oversight
- Transaction monitoring

### Phase 8 - Additional Features (Pending)
- Comments on lessons
- Reviews/ratings
- Notifications

### Phase 9 - Internationalization (Pending)
- Multi-language support

### Phase 10 - AI Documentation (Pending)
- Document AI integration points

### Phase 11 - Testing ✅
- Playwright E2E tests (47 scenarios across 4 test files)
- Multi-tenant isolation, auth security, payment security, comprehensive audit

### Phase 12 - Gamification ✅
- XP, levels, streaks, achievements, leaderboard, point store
- Multi-tenant scoped gamification profiles

### Phase 13 - Certificates ✅
- Certificate templates, auto-issuance on course completion
- QR-code public verification at `/verify/[code]`

### Phase 14 - Monetization ✅
- School billing via Stripe Checkout + manual bank transfer
- 5-tier pricing (Free → Enterprise) with feature gating
- Dynamic transaction fees (10% → 0%)
- LATAM payment support (MXN, COP, CLP, PEN, ARS, BRL)
- Revenue dashboard for school admins
- See `docs/MONETIZATION.md` for full details

## 🤝 Development Team

This is a **solo project** with AI assistance, rebuilt from a 1-year-old production LMS with significant technical debt.

### Original Version Issues
- Complex server actions for simple CRUD
- Overengineered abstractions
- Inconsistent UI patterns
- Poor mobile experience

### V2 Improvements
- RLS-based direct queries
- Modern Shadcn UI
- Consistent patterns
- Mobile-first design
- Comprehensive documentation (this!)
