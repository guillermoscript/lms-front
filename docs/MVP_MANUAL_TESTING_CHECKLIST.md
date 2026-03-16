# MVP Manual Testing Checklist

> Last updated: 2026-03-16
> Purpose: Comprehensive manual QA checklist for MVP launch readiness.
> Test each journey end-to-end. Mark with [x] when verified, add notes for issues found.

---

## How to Test

- **Local dev:** `npm run dev` at `http://localhost:3000`
- **Subdomain testing:** Set `NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000`, access `school-slug.lvh.me:3000`
- **Test accounts:** `student@test.com` / `teacher@test.com` / `admin@test.com` (all `password123`)
- **Roles:** Test each journey with the correct role. Try accessing other roles' routes to verify guards.

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| **P0** | Must work perfectly — blocks launch |
| **P1** | Should work — degraded experience if broken |
| **P2** | Nice to have — can ship with known issues |

---

## 1. Authentication & Onboarding (P0)

### 1.1 Sign Up
- [ ] Navigate to `/auth/sign-up`
- [ ] Fill email, password, full name
- [ ] Submit — should redirect to `/auth/sign-up-success`
- [ ] Check email for confirmation link
- [ ] Click confirmation → redirected to login
- [ ] Verify `profiles` row created with correct data
- [ ] Verify `user_roles` row created (default: `student`)

### 1.2 Login
- [ ] Navigate to `/auth/login`
- [ ] Login with valid credentials → redirected to role-based dashboard
- [ ] Login with invalid password → error message shown
- [ ] Login with non-existent email → error message shown
- [ ] Verify session persists on page reload
- [ ] Verify JWT contains `tenant_role`, `tenant_id`, `user_role` claims

### 1.3 Password Reset
- [ ] Click "Forgot password" on login page
- [ ] Enter email → confirmation message shown
- [ ] Check email for reset link
- [ ] Click link → opens `/auth/update-password`
- [ ] Set new password → success message
- [ ] Login with new password works

### 1.4 School Creation & Onboarding
- [ ] Navigate to `/create-school`
- [ ] Enter school name → slug auto-generated
- [ ] Submit → school created, user assigned as admin
- [ ] Redirected to `/onboarding`
- [ ] Complete onboarding wizard steps (branding, payment setup)
- [ ] Verify `tenants` row created with correct slug
- [ ] Verify `tenant_users` row created with role `admin`
- [ ] Access school via subdomain `school-slug.lvh.me:3000`

### 1.5 Join School
- [ ] Navigate to `/join-school` (or be redirected when accessing a school you're not a member of)
- [ ] Join school → `tenant_users` row created with role `student`
- [ ] Redirected to student dashboard for that school
- [ ] Verify user can now access school's subdomain routes

### 1.6 Language Switching
- [ ] Switch language to Spanish (es) via language selector
- [ ] Verify all UI text changes to Spanish
- [ ] Navigate multiple pages — language persists
- [ ] Switch back to English — all text reverts
- [ ] Verify URL changes from `/en/...` to `/es/...`

---

## 2. Student Journeys (P0)

### 2.1 Browse & Discover Courses
- [ ] Navigate to `/dashboard/student/browse`
- [ ] See list of available courses with thumbnails, descriptions
- [ ] Filter/search works
- [ ] Click a course → course detail page loads
- [ ] See course description, lesson count, instructor info
- [ ] See pricing info (free / paid amount)
- [ ] Enroll button visible for unenrolled courses

### 2.2 Free Course Enrollment
- [ ] Find a free course in browse
- [ ] Click enroll → enrollment created immediately
- [ ] Redirected to course page / courses list
- [ ] Course appears in "My Courses" (`/dashboard/student/courses`)
- [ ] Verify `enrollments` row with `status = 'active'`

### 2.3 Paid Course — Stripe Payment
- [ ] Find a paid course (Stripe product)
- [ ] Click purchase → redirected to Stripe Checkout
- [ ] Complete payment with test card (`4242 4242 4242 4242`)
- [ ] Webhook fires → `transaction` created with `status = 'successful'`
- [ ] Auto-enrollment triggers → `enrollments` row created
- [ ] Student sees course in "My Courses"
- [ ] Verify revenue split: platform fee + school payout amounts correct

### 2.4 Paid Course — Manual/Offline Payment
- [ ] Find a course with manual payment option
- [ ] Click purchase → payment request form shown
- [ ] Submit payment request → `payment_requests` row created with `status = 'pending'`
- [ ] Student sees "Pending" status on payments page
- [ ] **Switch to admin account** → see request in `/dashboard/admin/payment-requests`
- [ ] Admin views request details, sees payment instructions
- [ ] Admin confirms payment → status changes to `confirmed`
- [ ] `enroll_user()` RPC fires → student enrolled
- [ ] **Switch back to student** → course now in "My Courses"

### 2.5 Subscription Plan Purchase
- [ ] Navigate to school pricing page (`/pricing`)
- [ ] See available plans with features and pricing
- [ ] Select a plan → Stripe Checkout (or manual payment form)
- [ ] Complete purchase → `subscriptions` row created
- [ ] Student can now browse plan courses in `/dashboard/student/browse`
- [ ] Student self-enrolls in a plan course → enrollment created
- [ ] Verify `plan_courses` mapping is respected

### 2.6 Lesson Progression
- [ ] Open an enrolled course → see lesson list with progress indicators
- [ ] Click first lesson → lesson content renders (block editor content)
- [ ] Scroll through lesson — all block types render correctly:
  - [ ] Text, headings, images, videos, code blocks
  - [ ] Callouts, spoilers, steps, vocabulary
  - [ ] Quizzes, flashcards, fill-in-the-blank
  - [ ] File downloads, embeds
- [ ] Mark lesson as complete → completion recorded
- [ ] Progress bar updates on course page
- [ ] If sequential completion enabled: next lesson unlocks, previous lessons locked
- [ ] If sequential completion disabled: all lessons accessible

### 2.7 Lesson Comments & Interactions
- [ ] Open a lesson → scroll to comments section
- [ ] Post a comment → appears immediately
- [ ] Reply to a comment → threaded reply shows
- [ ] React to a comment (like, dislike, funny, boring)
- [ ] Verify reaction count updates
- [ ] Delete own comment → removed

### 2.8 Course Reviews
- [ ] Complete enough of a course to leave a review
- [ ] Submit a review with 1-5 star rating and text
- [ ] Review appears on course page
- [ ] Verify average rating updates

### 2.9 Exam Taking
- [ ] Navigate to a course with exams → exams page
- [ ] Start an exam → exam questions display
- [ ] Answer multiple choice, true/false, free text questions
- [ ] If timed: countdown timer visible and functional
- [ ] Submit exam → redirected to result page
- [ ] See score, pass/fail status
- [ ] See per-question feedback (if AI grading enabled)
- [ ] View submission review page with answers and correct answers

### 2.10 Exercise Completion
- [ ] Navigate to a course with exercises
- [ ] Open an exercise → see instructions and exercise type
- [ ] **Essay exercise:** Write response → submit → AI evaluates
- [ ] **Coding challenge:** Write code → submit → evaluated
- [ ] **Artifact exercise:** Build HTML/CSS/JS → preview → submit → AI evaluates
- [ ] **Quiz/Multiple choice:** Select answers → submit
- [ ] Verify exercise marked as complete after submission
- [ ] AI feedback appears with score/comments

### 2.11 AI Tutor (Aristotle)
- [ ] Open Aristotle chat (should be accessible from student dashboard/course)
- [ ] Send a question about course content
- [ ] AI responds with streaming text
- [ ] Context-aware: AI knows about enrolled courses/current lesson
- [ ] Session persists across messages
- [ ] Restart session works (clears history)

### 2.12 Student Dashboard Overview
- [ ] `/dashboard/student` shows:
  - [ ] Enrolled courses with progress cards
  - [ ] Quick stats (courses in progress, completed)
  - [ ] Leaderboard widget (if gamification enabled)
  - [ ] Recent activity or notifications

### 2.13 Student Profile
- [ ] Navigate to `/dashboard/student/profile`
- [ ] See account details (name, email)
- [ ] See billing history / transactions
- [ ] See active subscriptions
- [ ] See earned certificates
- [ ] See achievements (if gamification enabled)

### 2.14 Progress Tracking
- [ ] Navigate to `/dashboard/student/progress`
- [ ] See completion analytics per course
- [ ] See overall progress metrics
- [ ] Data matches actual lesson completions

---

## 3. Teacher Journeys (P0)

### 3.1 Course Creation
- [ ] Navigate to `/dashboard/teacher/courses/new`
- [ ] Fill title, description, select category
- [ ] Upload thumbnail image
- [ ] Save → course created in `draft` status
- [ ] Course appears in teacher's course list
- [ ] Verify `courses` row with `tenant_id` and `teacher_id`

### 3.2 Lesson Creation with Block Editor
- [ ] Open a course → click "Add Lesson"
- [ ] Fill lesson title
- [ ] Use block editor to add content:
  - [ ] Paragraph text
  - [ ] Heading (H1, H2, H3)
  - [ ] Image (upload or URL)
  - [ ] Video embed
  - [ ] Code block with syntax highlighting
  - [ ] Callout (info, warning, tip)
  - [ ] Quiz block
  - [ ] Spoiler/accordion
  - [ ] File download attachment
- [ ] Save lesson → content persisted
- [ ] Reopen lesson → all blocks render correctly
- [ ] Reorder lessons via drag-and-drop → sequence numbers update

### 3.3 Lesson Resources
- [ ] Open a lesson in edit mode
- [ ] Upload resource files (PDF, images, etc.)
- [ ] Save → resources attached to lesson
- [ ] View lesson as student → download links work

### 3.4 Exam Creation
- [ ] Navigate to course → "Create Exam"
- [ ] Set exam title, description, passing score
- [ ] Optionally set time limit
- [ ] Add questions:
  - [ ] Multiple choice (single correct answer)
  - [ ] True/false
  - [ ] Free text
- [ ] Add answer options with correct answer marked
- [ ] Save exam → appears in course exams list

### 3.5 Exercise Creation
- [ ] Navigate to course → exercises → "New Exercise"
- [ ] Select exercise type (essay, coding, artifact, quiz, etc.)
- [ ] Set title, instructions, AI evaluation prompt
- [ ] Save → exercise appears in course exercises list

### 3.6 Exam Grading & Submissions
- [ ] Navigate to course → exam → submissions
- [ ] See list of student submissions with scores
- [ ] Click a submission → see student answers vs correct answers
- [ ] See AI-generated feedback (if enabled)
- [ ] Override score manually → enter new score + reason
- [ ] Verify score updates in student's result view

### 3.7 Course Publishing
- [ ] Open a draft course with at least 1 lesson
- [ ] Change status to "Published"
- [ ] Course now visible in student browse
- [ ] Change back to "Draft" → hidden from browse

### 3.8 Course Preview
- [ ] Open a course → click "Preview"
- [ ] See course as student would see it
- [ ] Navigate through lessons in preview mode
- [ ] Verify content renders identically to student view

### 3.9 Certificate Templates
- [ ] Navigate to course → certificates settings
- [ ] Create/edit certificate template
- [ ] Configure template fields (title, description, design)
- [ ] Save template → linked to course
- [ ] When student completes course → certificate auto-issued

### 3.10 Revenue Dashboard
- [ ] Navigate to `/dashboard/teacher/revenue`
- [ ] See revenue stats (total, pending payouts, completed payouts)
- [ ] See transaction list
- [ ] See revenue trends/charts

### 3.11 AI Prompt Templates
- [ ] Navigate to `/dashboard/teacher/templates`
- [ ] Create new prompt template (for AI grading)
- [ ] Edit existing template
- [ ] Delete template
- [ ] Use template when configuring exam/exercise AI grading

### 3.12 Teacher Dashboard Overview
- [ ] `/dashboard/teacher` shows:
  - [ ] Course count, active students, pending submissions
  - [ ] Course cards with thumbnails
  - [ ] Quick actions

---

## 4. Admin Journeys (P0)

### 4.1 Admin Dashboard Overview
- [ ] `/dashboard/admin` shows:
  - [ ] Key metrics (users, courses, revenue, enrollments)
  - [ ] Recent activity
  - [ ] Quick links to management pages

### 4.2 User Management
- [ ] Navigate to `/dashboard/admin/users`
- [ ] See list of school members with roles
- [ ] Search/filter users
- [ ] Click user → detail page with activity
- [ ] Change user role (student → teacher, etc.) → role updates
- [ ] Invite new user via email → invitation sent
- [ ] New user receives invite, creates account, auto-assigned role

### 4.3 Course Management
- [ ] Navigate to `/dashboard/admin/courses`
- [ ] See all courses with status, teacher, student count
- [ ] Admin can manage course visibility/status

### 4.4 Enrollment Management
- [ ] Navigate to `/dashboard/admin/enrollments`
- [ ] See all enrollments with student, course, status
- [ ] Filter by status (active, disabled)
- [ ] Search by student name

### 4.5 Category Management
- [ ] Navigate to `/dashboard/admin/categories`
- [ ] Create new category → appears in list
- [ ] Edit category name/description
- [ ] Delete category (if no courses assigned)

### 4.6 Product Management
- [ ] Navigate to `/dashboard/admin/products`
- [ ] Create new product → link courses, set price, payment method
- [ ] Edit product → update price, description
- [ ] Verify `product_courses` mappings correct
- [ ] Product appears on student browse/pricing

### 4.7 Plan Management (Subscriptions)
- [ ] Navigate to `/dashboard/admin/plans`
- [ ] Create subscription plan → set name, price, billing period
- [ ] Link courses to plan (`plan_courses`)
- [ ] Edit plan features and pricing
- [ ] Plan appears on school pricing page

### 4.8 Payment Request Management
- [ ] Navigate to `/dashboard/admin/payment-requests`
- [ ] See pending payment requests from students
- [ ] Click request → detail page with student info, amount, instructions
- [ ] Approve request → student gets enrolled
- [ ] Reject request → student notified, no enrollment

### 4.9 Transaction Monitoring
- [ ] Navigate to `/dashboard/admin/transactions`
- [ ] See all transactions with status, amount, student, date
- [ ] Filter by status (pending, successful, failed, refunded)
- [ ] Verify amounts and statuses are correct

### 4.10 Subscription Management
- [ ] Navigate to `/dashboard/admin/subscriptions`
- [ ] See active subscriptions with student, plan, dates
- [ ] Verify subscription statuses accurate

### 4.11 Revenue Dashboard
- [ ] Navigate to `/dashboard/admin/revenue`
- [ ] See total revenue, platform fees, net revenue
- [ ] Revenue by product/plan breakdown
- [ ] Monthly trends chart
- [ ] Payout tracking

### 4.12 Monetization Overview
- [ ] Navigate to `/dashboard/admin/monetization`
- [ ] See combined monetization metrics
- [ ] Products and plans performance

### 4.13 Billing & Plan Upgrade
- [ ] Navigate to `/dashboard/admin/billing`
- [ ] See current plan (Free/Starter/Pro/Business/Enterprise)
- [ ] See usage vs limits (courses, students, transaction fee %)
- [ ] Click upgrade → `/dashboard/admin/billing/upgrade`
- [ ] See plan comparison table
- [ ] Select plan → Stripe Checkout or manual payment form
- [ ] Complete upgrade → plan changes, limits increase
- [ ] Feature gates unlock (e.g., landing pages on Starter+)

### 4.14 School Settings
- [ ] Navigate to `/dashboard/admin/settings`
- [ ] Edit school name, description, contact email, timezone
- [ ] Save → changes persisted
- [ ] Verify `tenant_settings` updated

### 4.15 Appearance/Branding
- [ ] Navigate to `/dashboard/admin/appearance`
- [ ] Upload logo
- [ ] Set primary/secondary colors
- [ ] Save → theme applied across school
- [ ] Verify CSS custom properties update
- [ ] Dark/light mode still works with custom colors

### 4.16 Landing Page Builder (Starter+ Plan)
- [ ] Navigate to `/dashboard/admin/landing-page`
- [ ] Create new landing page
- [ ] Open Puck visual editor
- [ ] Drag and drop components:
  - [ ] Hero section
  - [ ] Features grid
  - [ ] Course grid
  - [ ] Pricing table
  - [ ] Testimonials
  - [ ] FAQ
  - [ ] CTA section
  - [ ] Contact form
- [ ] Upload images → stored in Supabase Storage
- [ ] Preview page in new tab
- [ ] Save and publish → page accessible at `/p/[slug]`
- [ ] Use template (e.g., "Modern Academy") → pre-populated layout
- [ ] Activate/deactivate pages

### 4.17 Community Management
- [ ] Navigate to `/dashboard/admin/community`
- [ ] See all community posts
- [ ] Navigate to `/dashboard/admin/community/moderation`
- [ ] See flagged content
- [ ] Pin/unpin posts
- [ ] Lock/unlock threads
- [ ] Hide/show posts
- [ ] Mute users (with optional expiration)
- [ ] Review and resolve flagged content

### 4.18 Notification Management
- [ ] Navigate to `/dashboard/admin/notifications`
- [ ] See notification history
- [ ] Navigate to `/dashboard/admin/notifications/templates`
- [ ] Create/edit notification templates
- [ ] Verify notifications reach users

### 4.19 Analytics
- [ ] Navigate to `/dashboard/admin/analytics`
- [ ] See analytics dashboard with charts
- [ ] Verify data accuracy against known state

### 4.20 API Tokens
- [ ] Navigate to `/dashboard/admin/api-tokens`
- [ ] Generate new API token
- [ ] Token displayed (copy to clipboard)
- [ ] Token works for MCP integration

---

## 5. Gamification (P1)

### 5.1 XP Earning
- [ ] Complete a lesson → XP awarded (check gamification header)
- [ ] Submit an exam → XP awarded
- [ ] Complete an exercise → XP awarded
- [ ] Post a comment → XP awarded
- [ ] Leave a course review → XP awarded
- [ ] Verify daily cap (1,000 XP/day) enforced
- [ ] Verify bonus XP (streaks) exempt from cap

### 5.2 Level Progression
- [ ] Earn enough XP to level up
- [ ] Level indicator updates in header
- [ ] Level-up notification or visual feedback
- [ ] Progress bar shows XP toward next level

### 5.3 Daily Streaks
- [ ] Complete an activity → streak counter starts/increments
- [ ] Return next day, complete activity → streak continues
- [ ] Miss a day → streak resets (unless freeze power-up active)
- [ ] Streak visible in gamification header/profile

### 5.4 Achievements
- [ ] Trigger an achievement (e.g., complete first lesson, 7-day streak)
- [ ] Achievement notification appears
- [ ] Achievement visible in profile
- [ ] Verify correct achievement unlocked based on criteria

### 5.5 Leaderboard
- [ ] Navigate to leaderboard (widget on dashboard or dedicated view)
- [ ] See ranked users by XP
- [ ] Own position highlighted
- [ ] Data refreshes (leaderboard_cache)

### 5.6 Coins & Store
- [ ] Navigate to `/dashboard/student/store`
- [ ] See available store items with prices (in coins)
- [ ] Purchase an item → coins deducted
- [ ] Item appears in inventory/profile
- [ ] Verify coin balance updates correctly

### 5.7 Multi-Tenant Isolation
- [ ] Student has gamification profile in School A
- [ ] Join School B → separate gamification profile created
- [ ] XP earned in School A does NOT appear in School B
- [ ] Leaderboard shows only School A users in School A

---

## 6. Certificates (P1)

### 6.1 Certificate Issuance
- [ ] Teacher creates certificate template for a course
- [ ] Student completes all lessons in course
- [ ] Certificate auto-issued (via RPC `check_and_issue_certificate`)
- [ ] Certificate appears in student's certificates page

### 6.2 Certificate Viewing & Download
- [ ] Navigate to `/dashboard/student/certificates`
- [ ] See list of earned certificates
- [ ] Click certificate → detail view with design
- [ ] Download PDF → opens correctly with proper formatting
- [ ] Verify PDF has: student name, course name, date, watermark, QR code

### 6.3 Certificate Verification
- [ ] Get certificate verification code/URL
- [ ] Navigate to `/verify/[code]` (public, no login required)
- [ ] See certificate details: student name, course, date, issuing school
- [ ] Verify QR code links back to verification page

### 6.4 Certificate Revocation (Admin)
- [ ] Admin revokes a certificate → `revoked_by` and `revoked_at` set
- [ ] Student no longer sees certificate as valid
- [ ] Verification page shows revoked status

---

## 7. Community Spaces (P1)

### 7.1 School Feed
- [ ] Navigate to `/dashboard/student/community`
- [ ] See school-wide post feed
- [ ] Create a post (text content)
- [ ] Post appears in feed
- [ ] Other users see the post

### 7.2 Course Community
- [ ] Navigate to course → community tab
- [ ] See course-scoped posts
- [ ] Create post in course context
- [ ] Post only visible in this course's community

### 7.3 Post Types
- [ ] Create standard post → text content
- [ ] Create discussion prompt → question format
- [ ] Create poll → vote options shown
- [ ] Vote on poll → results update
- [ ] Create milestone post → celebration format

### 7.4 Comments & Reactions
- [ ] Comment on a post → threaded reply appears
- [ ] Reply to a comment → nested thread (up to 5 levels)
- [ ] React to a post (like, helpful, insightful, fire)
- [ ] Reaction counts update in real-time
- [ ] Remove reaction → count decreases

### 7.5 Moderation
- [ ] Flag a post → flagged for admin review
- [ ] **As admin:** see flagged content in moderation panel
- [ ] Pin a post → appears at top of feed
- [ ] Lock a thread → no new comments allowed
- [ ] Hide a post → removed from feed but not deleted
- [ ] Mute a user → user cannot post (with optional expiration)

---

## 8. Platform Super Admin (P1)

### 8.1 Platform Dashboard
- [ ] Navigate to `/platform`
- [ ] See platform-wide stats (total tenants, users, revenue)
- [ ] Quick links to management pages

### 8.2 Tenant Management
- [ ] Navigate to `/platform/tenants`
- [ ] See all tenants with plan, member count, status
- [ ] Click tenant → detail page
- [ ] See tenant's courses, revenue, plan info

### 8.3 Platform Billing
- [ ] Navigate to `/platform/billing`
- [ ] See platform billing overview
- [ ] Manage platform payment requests (school plan payments)
- [ ] Approve/reject manual payment requests for plan upgrades

### 8.4 Platform Plans
- [ ] Navigate to `/platform/plans`
- [ ] See/edit platform plan definitions
- [ ] Modify limits (courses, students, fee %)
- [ ] Changes reflected in feature gating

### 8.5 Referral Codes
- [ ] Navigate to `/platform/referrals`
- [ ] Create referral code
- [ ] See redemption history
- [ ] Verify code works when used during signup

---

## 9. Multi-Tenant Isolation (P0)

### 9.1 Data Isolation
- [ ] Login as student in School A → see only School A's courses
- [ ] Login as student in School B → see only School B's courses
- [ ] Verify no cross-tenant data leakage in:
  - [ ] Course listings
  - [ ] Enrollment records
  - [ ] Transaction history
  - [ ] User lists (admin)
  - [ ] Community posts
  - [ ] Leaderboard
  - [ ] Certificates

### 9.2 Subdomain Routing
- [ ] Access `school-a.lvh.me:3000` → School A content
- [ ] Access `school-b.lvh.me:3000` → School B content
- [ ] Access main domain → platform landing page
- [ ] Invalid subdomain → appropriate error/redirect

### 9.3 Role Isolation
- [ ] Student cannot access `/dashboard/teacher/*` routes → redirected
- [ ] Student cannot access `/dashboard/admin/*` routes → redirected
- [ ] Teacher cannot access `/dashboard/admin/*` routes → redirected
- [ ] Non-super-admin cannot access `/platform/*` routes → redirected

### 9.4 Multi-School Membership
- [ ] User joins School A as student
- [ ] Same user joins School B as student
- [ ] Switching schools shows correct data for each
- [ ] Roles are independent per school (student in A, teacher in B if invited)

---

## 10. Payment Security (P0)

### 10.1 Price Integrity
- [ ] Student cannot modify payment amount client-side
- [ ] Stripe PaymentIntent amount matches product price on server
- [ ] Manual payment request records correct amount

### 10.2 Enrollment Security
- [ ] Cannot enroll without valid payment (paid courses)
- [ ] Cannot enroll in another tenant's courses
- [ ] Double payment prevention (partial unique index on transactions)
- [ ] Failed payment does not create enrollment

### 10.3 Webhook Security
- [ ] Stripe webhooks validate signature
- [ ] Replay attacks rejected
- [ ] Invalid webhook payloads rejected

---

## 11. Responsive Design & Dark Mode (P2)

### 11.1 Mobile Responsiveness
- [ ] Student dashboard — readable on mobile viewport (375px)
- [ ] Course browse — cards stack vertically
- [ ] Lesson viewer — content fits mobile screen
- [ ] Navigation — mobile menu/hamburger works
- [ ] Block editor content — all blocks responsive
- [ ] Exam taking — questions readable on mobile
- [ ] Checkout flow — payment form usable on mobile

### 11.2 Dark Mode
- [ ] Toggle dark mode → all pages switch
- [ ] Light mode toggle → reverts
- [ ] System preference detection works
- [ ] Custom tenant colors work in both modes
- [ ] No contrast issues in either mode
- [ ] Charts/graphs visible in dark mode

---

## 12. Edge Cases & Error States (P1)

### 12.1 Loading States
- [ ] Slow network: loading skeletons/spinners appear
- [ ] No infinite loading — timeouts handled gracefully

### 12.2 Empty States
- [ ] No courses → appropriate empty state message
- [ ] No enrollments → "Browse courses" CTA
- [ ] No transactions → empty state
- [ ] No community posts → "Be the first to post"
- [ ] No certificates → empty state
- [ ] No submissions → empty state

### 12.3 Error Handling
- [ ] Network error → error message displayed
- [ ] 404 pages → custom not found page
- [ ] Unauthorized access → redirect to login or error page
- [ ] Form validation → inline error messages

### 12.4 Session Expiry
- [ ] Session expires → user redirected to login
- [ ] Re-login → returned to previous page
- [ ] No data loss on session expiry during form fill

---

## 13. Feature Gating Verification (P1)

Verify features are properly gated by plan:

| Feature | Free | Starter | Pro | Business |
|---------|------|---------|-----|----------|
| [ ] Course limit (5/15/100/unlimited) | | | | |
| [ ] Student limit (50/200/1000/unlimited) | | | | |
| [ ] Transaction fee (10%/5%/2%/0%) | | | | |
| [ ] Landing page builder | blocked | [ ] works | [ ] works | [ ] works |
| [ ] Community spaces | blocked | [ ] works | [ ] works | [ ] works |
| [ ] Leaderboard & Achievements | blocked | [ ] works | [ ] works | [ ] works |
| [ ] Point Store | blocked | blocked | [ ] works | [ ] works |
| [ ] AI Auto-Grading | blocked | blocked | [ ] works | [ ] works |
| [ ] Advanced Analytics | blocked | blocked | [ ] works | [ ] works |
| [ ] Custom Branding | blocked | blocked | blocked | [ ] works |

---

## 14. i18n Verification (P2)

### 14.1 English (en) — Spot Check
- [ ] Auth pages — all text in English
- [ ] Student dashboard — all labels/buttons in English
- [ ] Teacher dashboard — all labels/buttons in English
- [ ] Admin dashboard — all labels/buttons in English
- [ ] Error messages — in English
- [ ] No missing translation keys (no raw key strings visible)

### 14.2 Spanish (es) — Spot Check
- [ ] Auth pages — all text in Spanish
- [ ] Student dashboard — all labels/buttons in Spanish
- [ ] Teacher dashboard — all labels/buttons in Spanish
- [ ] Admin dashboard — all labels/buttons in Spanish
- [ ] Error messages — in Spanish
- [ ] No missing translation keys

---

## E2E Automated Test Coverage (Playwright)

> Updated: 2026-03-16 — **169 passing, 0 failed, 2 skipped**
> Run: `npx playwright test --project='desktop-chromium'`
> Specs: `tests/playwright/specs/*.spec.md` (source of truth for each test file)

### Test Files Overview

| # | Test File | Tests | Spec File | Covers Sections |
|---|-----------|-------|-----------|-----------------|
| 1 | `auth-security.spec.ts` | 12 | `specs/auth-security.spec.md` | 1.1, 1.2, 9.3, 10.3 |
| 2 | `tenant-isolation.spec.ts` | 10 | `specs/tenant-isolation.spec.md` | 9.1, 9.2 |
| 3 | `payment-flows.spec.ts` | 6 | `specs/payment-flows.spec.md` | 2.4, 2.5, 10.2 |
| 4 | `admin-pages.spec.ts` | 10 | `specs/admin-dashboard.spec.md` | 4.1–4.9, 4.14 |
| 5 | `admin-management.spec.ts` | 8 | `specs/admin-dashboard.spec.md` | 4.8, 4.10, 4.13, 4.18, 4.19 |
| 6 | `teacher-courses.spec.ts` | 9 | `specs/teacher-courses.spec.md` | 3.1, 3.9, 3.10, 3.12 |
| 7 | `teacher-content.spec.ts` | 16 | `specs/teacher-content-crud.spec.md` | 3.2, 3.4, 3.5, 3.9 |
| 8 | `student-courses.spec.ts` | 11 | `specs/student-flows.spec.md` | 2.1, 2.6, 2.7, 2.8, 2.12 |
| 9 | `student-features.spec.ts` | 9 | `specs/student-features.spec.md` | 2.12, 2.13, 2.14 |
| 10 | `community.spec.ts` | 8 | `specs/community-spaces.spec.md` | 7.1, 7.5 |
| 11 | `gamification.spec.ts` | 10 | `specs/gamification.spec.md` | 5.1–5.6 |
| 12 | `evaluations-security.spec.ts` | 15 | `specs/evaluations-security.spec.md` | 2.6, 2.10, 9.1 |
| 13 | `platform-panel.spec.ts` | 31 | `specs/platform-panel.spec.md` | 8.1–8.5 |
| 14 | `feature-gating.spec.ts` | 4 | `specs/feature-gating-i18n.spec.md` | 13 |
| 15 | `i18n.spec.ts` | 4 | `specs/feature-gating-i18n.spec.md` | 14 |

### Coverage by MVP Section

| Section | Priority | Manual Items | E2E Tests | Auto Coverage | What's Automated | What Needs Manual Testing |
|---------|----------|-------------|-----------|---------------|------------------|--------------------------|
| **1. Auth & Onboarding** | P0 | 35 | 12 | ~34% | Login UI, invalid creds, route guards, sign-up form, CSRF, security headers, role redirect | Actual sign-up flow (email), password reset, school creation, join school, language switching |
| **2. Student Journeys** | P0 | 67 | 26 | ~39% | Browse page, course detail, lesson content+toggle, comments section, reviews section, enrollment status variants, progress page, profile, payments, certificates, store | Free/paid enrollment E2E, Stripe checkout, manual payment, exam taking, exercise submission, AI tutor, block type rendering |
| **3. Teacher Journeys** | P0 | 55 | 25 | ~45% | Dashboard, course list, create form, course detail tabs (lessons/exercises/exams/certs), lesson editor (existing+new, step nav), exercise builder (form+step nav), exam builder (form+add questions), cert template form, revenue, templates | Actual lesson save/publish, block editor content creation, exam grading, course publishing, AI templates |
| **4. Admin Journeys** | P0 | 95 | 18 | ~19% | Dashboard+stats, users list+detail, courses, enrollments, transactions, products, plans, categories, settings, subscriptions, notifications, billing+upgrade, analytics | CRUD operations (create/edit/delete), landing page builder, appearance/branding, community moderation, API tokens |
| **5. Gamification** | P1 | 30 | 10 | ~33% | Store page+items, XP header card, streak indicator, leaderboard, profile stats/calendar/achievements | Actual XP earning, level-up, streak mechanics, achievement triggers, coin purchases, multi-tenant isolation |
| **6. Certificates** | P1 | 16 | 1 | ~6% | Certificates page loads | Certificate issuance, PDF download, verification page, revocation |
| **7. Community** | P1 | 24 | 8 | ~33% | Student/teacher/admin community page loads, feed structure, composer, filters, moderation button | Post creation, comments, reactions, polls, pinning, locking, muting, cross-tenant |
| **8. Platform Super Admin** | P1 | 20 | 31 | ~100% | Security guards, overview metrics, tenant management (list+detail+search+filter), billing tabs, plan editing, referral codes, impersonation | Fully covered |
| **9. Multi-Tenant Isolation** | P0 | 22 | 25 | ~100% | Data isolation (courses, browse, pricing), subdomain routing, role guards, non-member redirect, DB-level tenant_id checks, exercise isolation, lesson completion tenant_id | Fully covered |
| **10. Payment Security** | P0 | 12 | 6 | ~50% | Checkout auth requirement, payment request scoping, CSRF, pricing page rendering | Stripe webhook validation, price tampering, double payment prevention |
| **11. Responsive & Dark** | P2 | 14 | 0 | 0% | — | All manual (mobile viewport, dark mode toggle, contrast) |
| **12. Edge Cases** | P1 | 14 | 0 | 0% | — | All manual (loading states, empty states, error handling, session expiry) |
| **13. Feature Gating** | P1 | 20 | 4 | ~20% | Billing usage meters, upgrade page, public pricing, course creation limits | Per-feature verification across plans |
| **14. i18n** | P2 | 12 | 4 | ~33% | /en and /es routing, Spanish login page, locale persistence | Full spot-check of all pages in both languages |

### Summary

| Priority | Manual Items | E2E Tests | Automated | Remaining Manual |
|----------|-------------|-----------|-----------|-----------------|
| **P0** | 286 | 112 | ~39% | ~174 items |
| **P1** | 124 | 54 | ~44% | ~70 items |
| **P2** | 26 | 4 | ~15% | ~22 items |
| **Total** | **436** | **169** | **~39%** | **~267 items** |

### Strongest Coverage (can rely on E2E)
- Multi-tenant isolation (100%) — data, routing, role guards, DB-level
- Platform super admin (100%) — all pages, CRUD, search, filters
- Teacher content builders (45%) — form rendering, step navigation, tab switching
- Auth route guards (34%) — all protected routes, role-based redirects

### Biggest Gaps (need manual testing)
- Admin CRUD operations (19%) — create/edit products, plans, users
- Certificate lifecycle (6%) — issuance, PDF, verification
- Responsive design (0%) — all mobile/dark mode
- Edge cases (0%) — loading states, errors, session expiry
- Payment E2E (50%) — Stripe integration, webhook flow

---

## Summary Scorecard

Fill this in after testing:

| Section | Total Tests | Passed | Failed | Notes |
|---------|------------|--------|--------|-------|
| 1. Auth & Onboarding | | | | |
| 2. Student Journeys | | | | |
| 3. Teacher Journeys | | | | |
| 4. Admin Journeys | | | | |
| 5. Gamification | | | | |
| 6. Certificates | | | | |
| 7. Community | | | | |
| 8. Super Admin | | | | |
| 9. Multi-Tenant | | | | |
| 10. Payment Security | | | | |
| 11. Responsive/Dark | | | | |
| 12. Edge Cases | | | | |
| 13. Feature Gating | | | | |
| 14. i18n | | | | |
| **TOTAL** | | | | |

---

## Issue Tracking Template

When you find an issue, document it like this:

```
### Issue: [Short description]
- **Section:** [e.g., 2.6 Lesson Progression]
- **Priority:** P0/P1/P2
- **Steps to reproduce:**
  1. ...
  2. ...
- **Expected:** ...
- **Actual:** ...
- **Screenshot:** [if applicable]
- **Browser/Device:** ...
```
