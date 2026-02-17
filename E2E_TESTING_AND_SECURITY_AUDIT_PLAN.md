# E2E Testing & Security Audit Plan

**Created:** 2026-02-16
**Status:** ✅ COMPLETE - All 47 Tests Implemented
**Tool:** Playwright MCP
**Last Updated:** 2026-02-16

---

## ✅ Implementation Complete

**Test Files Created:**
1. ✅ `tests/playwright/multi-tenant-isolation.spec.ts` (8 tests)
2. ✅ `tests/playwright/authentication-security.spec.ts` (6 tests)
3. ✅ `tests/playwright/payment-security.spec.ts` (7 tests)
4. ✅ `tests/playwright/comprehensive-security-audit.spec.ts` (26 tests)

**Total:** 47 comprehensive E2E tests

**Documentation:**
- ✅ `TEST_EXECUTION_GUIDE.md` - Complete execution guide
- ✅ `MULTI_TENANT_IMPLEMENTATION_SUMMARY.md` - Full implementation summary

**To Execute Tests:**
```bash
npx playwright test
```

See `TEST_EXECUTION_GUIDE.md` for detailed instructions.

---

## Executive Summary

This document outlines a comprehensive End-to-End (E2E) testing and security audit plan for the multi-tenant LMS platform. The plan covers 47 critical test scenarios across 8 major categories, focusing on multi-tenancy isolation, authentication security, payment flows, and data protection.

**Testing Priorities:**
1. **CRITICAL:** Multi-tenant data isolation (prevent cross-tenant leaks)
2. **CRITICAL:** Authentication & authorization flows
3. **CRITICAL:** Payment security (Stripe Connect, manual payments)
4. **HIGH:** Revenue infrastructure (splits, payouts, refunds)
5. **HIGH:** Join school flow and tenant switching
6. **MEDIUM:** Onboarding wizard and plan limits
7. **MEDIUM:** Dashboard access controls
8. **LOW:** UI/UX validation

---

## 🎯 Test Categories

### Category 1: Multi-Tenant Data Isolation (CRITICAL)

**Priority:** P0 - Security Critical
**Total Tests:** 8

#### Test 1.1: Cross-Tenant Course Isolation
**Objective:** Verify students cannot access courses from other tenants

**Test Steps:**
1. Create School A with course "Math 101"
2. Create School B with course "Science 201"
3. Create student account at School A
4. Enroll student in "Math 101" at School A
5. Try to access "Science 201" from School B via direct URL
6. Try to enroll in School B course via API call

**Expected Results:**
- ✅ Student can access "Math 101" from School A
- ✅ Student CANNOT access "Science 201" from School B
- ✅ API enrollment call fails with 404 or 403
- ✅ No cross-tenant data visible in dashboard
- ✅ Database queries filtered by tenant_id

**Security Risk:** HIGH - Data breach, unauthorized course access

---

#### Test 1.2: Cross-Tenant User Data Isolation
**Objective:** Verify admin/teacher at School A cannot see users from School B

**Test Steps:**
1. Create School A with 10 students
2. Create School B with 10 different students
3. Login as admin at School A
4. Navigate to /dashboard/admin/users
5. Inspect user list API response
6. Try to access School B student profile directly

**Expected Results:**
- ✅ Admin sees only School A's 10 students
- ✅ School B students not in API response
- ✅ Direct access to School B student profile fails
- ✅ User count shows only School A users
- ✅ No cross-tenant user_id leaks

**Security Risk:** HIGH - PII exposure, GDPR violation

---

#### Test 1.3: Cross-Tenant Transaction Isolation
**Objective:** Verify revenue data is isolated per tenant

**Test Steps:**
1. School A has 5 transactions ($500 total)
2. School B has 3 transactions ($300 total)
3. Login as admin at School A
4. Navigate to /dashboard/admin/transactions
5. Navigate to /dashboard/teacher/revenue
6. Inspect API responses for transaction data

**Expected Results:**
- ✅ School A admin sees only 5 transactions
- ✅ Revenue dashboard shows $500 (not $800)
- ✅ Transaction IDs are from School A only
- ✅ No School B payment data visible
- ✅ Database queries include tenant_id filter

**Security Risk:** CRITICAL - Financial data leak, compliance violation

---

#### Test 1.4: Cross-Tenant Product/Plan Isolation
**Objective:** Verify products and plans are tenant-scoped

**Test Steps:**
1. School A creates product "Math Course" ($100)
2. School B creates product "Science Course" ($150)
3. Student visits School A's /pricing page
4. Student visits School B's /pricing page
5. Try to purchase School B product while logged into School A

**Expected Results:**
- ✅ School A pricing shows only "Math Course"
- ✅ School B pricing shows only "Science Course"
- ✅ Cannot purchase cross-tenant products
- ✅ Checkout validates product belongs to current tenant
- ✅ Payment intent creation fails for wrong tenant

**Security Risk:** CRITICAL - Unauthorized purchases, payment fraud

---

#### Test 1.5: Cross-Tenant Enrollment Isolation
**Objective:** Verify enrollments are scoped to tenant

**Test Steps:**
1. School A student enrolls in School A course
2. Try to access School B course while authenticated at School A
3. Manually create enrollment with wrong tenant_id in database
4. Verify RLS policies reject the operation

**Expected Results:**
- ✅ Enrollment works for same-tenant course
- ✅ Cross-tenant enrollment blocked by middleware
- ✅ Direct database insert blocked by RLS
- ✅ API returns 404 for cross-tenant courses
- ✅ Dashboard shows only same-tenant enrollments

**Security Risk:** HIGH - Unauthorized course access

---

#### Test 1.6: Middleware Tenant Detection
**Objective:** Verify middleware correctly detects tenant from subdomain

**Test Steps:**
1. Visit school-a.localhost:3000
2. Visit school-b.localhost:3000
3. Check x-tenant-id header in requests
4. Verify JWT contains correct tenant_id claim
5. Switch between subdomains

**Expected Results:**
- ✅ school-a subdomain sets tenant_id for School A
- ✅ school-b subdomain sets tenant_id for School B
- ✅ Invalid subdomain redirects to platform root
- ✅ JWT claim matches subdomain tenant
- ✅ Session maintains correct tenant context

**Security Risk:** CRITICAL - Entire multi-tenancy depends on this

---

#### Test 1.7: RLS Policy Enforcement
**Objective:** Verify Row Level Security policies prevent cross-tenant access

**Test Steps:**
1. Get user's session token
2. Make direct Supabase client queries
3. Try to query courses from other tenant
4. Try to query transactions from other tenant
5. Try to insert data with wrong tenant_id

**Expected Results:**
- ✅ SELECT returns only current tenant's data
- ✅ INSERT with wrong tenant_id fails
- ✅ UPDATE cannot modify other tenant's data
- ✅ DELETE cannot remove other tenant's data
- ✅ Service role bypasses RLS (for admin operations)

**Security Risk:** CRITICAL - Database-level security breach

---

#### Test 1.8: Gamification Data Isolation
**Objective:** Verify leaderboards and XP are tenant-scoped

**Test Steps:**
1. Student at School A earns 1000 XP
2. Student at School B earns 500 XP
3. View leaderboard at School A
4. View leaderboard at School B
5. Check XP totals in dashboard

**Expected Results:**
- ✅ School A leaderboard shows only School A students
- ✅ School B leaderboard independent
- ✅ XP totals don't include cross-tenant data
- ✅ Achievements scoped to tenant
- ✅ Store items filtered by tenant

**Security Risk:** MEDIUM - Competitive fairness, data mixing

---

### Category 2: Authentication & Authorization (CRITICAL)

**Priority:** P0 - Security Critical
**Total Tests:** 6

#### Test 2.1: Login with Tenant Context
**Objective:** Verify login preserves tenant context

**Test Steps:**
1. User signs up at school-a.localhost:3000
2. User logs out
3. User logs in at school-a.localhost:3000
4. Check preferred_tenant_id in JWT
5. Verify redirected to correct tenant dashboard

**Expected Results:**
- ✅ Login sets preferred_tenant_id to School A
- ✅ JWT contains correct tenant_id claim
- ✅ Redirects to school-a dashboard (not school-b)
- ✅ Session cookie domain correct
- ✅ Can access School A resources

**Security Risk:** HIGH - Session hijacking, wrong tenant access

---

#### Test 2.2: Password Reset Tenant Preservation
**Objective:** Verify password reset maintains tenant subdomain

**Test Steps:**
1. Student at school-a.localhost:3000
2. Click "Forgot Password"
3. Enter email, submit
4. Check reset email link
5. Click link, verify stays on school-a subdomain
6. Reset password, verify login works

**Expected Results:**
- ✅ Reset link points to school-a.localhost:3000
- ✅ Not redirected to platform root domain
- ✅ After reset, user logs into School A
- ✅ preferred_tenant_id unchanged
- ✅ Session maintains tenant context

**Security Risk:** MEDIUM - User confusion, loss of tenant context

---

#### Test 2.3: Email Confirmation Tenant Context
**Objective:** Verify email confirmation sets correct tenant

**Test Steps:**
1. User signs up at school-b.localhost:3000
2. Receives confirmation email
3. Clicks confirmation link
4. Check redirect URL and tenant_id
5. Verify user is member of School B

**Expected Results:**
- ✅ Confirmation link includes school-b subdomain
- ✅ User added to School B's tenant_users
- ✅ preferred_tenant_id set to School B
- ✅ JWT includes School B tenant_id
- ✅ Redirects to School B dashboard

**Security Risk:** HIGH - User assigned to wrong tenant

---

#### Test 2.4: Role-Based Access Control
**Objective:** Verify role restrictions work correctly

**Test Steps:**
1. Login as student
2. Try to access /dashboard/admin
3. Try to access /dashboard/teacher
4. Login as teacher
5. Try to access /dashboard/admin
6. Login as admin
7. Access all dashboards

**Expected Results:**
- ✅ Student redirected from admin/teacher dashboards
- ✅ Teacher can access teacher dashboard
- ✅ Teacher redirected from admin dashboard
- ✅ Admin can access all dashboards
- ✅ API endpoints enforce role checks

**Security Risk:** HIGH - Privilege escalation

---

#### Test 2.5: JWT Token Expiration
**Objective:** Verify expired tokens are rejected

**Test Steps:**
1. Login and get session token
2. Wait for token to expire (or manipulate timestamp)
3. Try to access protected route
4. Try to call protected API
5. Verify forced logout

**Expected Results:**
- ✅ Expired token rejected
- ✅ User redirected to login
- ✅ API returns 401 Unauthorized
- ✅ Session cleared
- ✅ Refresh token flow works if valid

**Security Risk:** MEDIUM - Session security

---

#### Test 2.6: Super Admin Bypass
**Objective:** Verify super admins can access all tenants

**Test Steps:**
1. Login as super admin
2. Visit school-a.localhost:3000
3. Access admin dashboard
4. View all schools' data
5. Switch to school-b.localhost:3000
6. Repeat access checks

**Expected Results:**
- ✅ Super admin can access School A data
- ✅ Super admin can access School B data
- ✅ RLS policies include is_super_admin() check
- ✅ Can switch between tenants freely
- ✅ Cannot be blocked by RLS

**Security Risk:** HIGH - Must be tightly controlled

---

### Category 3: Payment Flows (CRITICAL)

**Priority:** P0 - Financial Security
**Total Tests:** 7

#### Test 3.1: Stripe Connect Payment Flow
**Objective:** Verify Stripe Connect routes payments correctly

**Test Steps:**
1. School A connects Stripe account
2. School A creates paid course ($100)
3. Student purchases course
4. Check payment intent includes:
   - application_fee_amount (20%)
   - transfer_data.destination (School A's account)
5. Verify transaction created with correct tenant_id

**Expected Results:**
- ✅ Payment intent created with $20 platform fee
- ✅ $80 transfers to School A's Stripe account
- ✅ Transaction record has School A's tenant_id
- ✅ Webhook updates transaction status
- ✅ Student enrolled in course

**Security Risk:** CRITICAL - Financial loss, payment fraud

---

#### Test 3.2: Payment Without Stripe Connected
**Objective:** Verify error when Stripe not connected

**Test Steps:**
1. School B has not connected Stripe
2. School B creates paid course
3. Student tries to purchase
4. Check error message

**Expected Results:**
- ✅ Checkout shows error
- ✅ Error: "School has not connected payment account"
- ✅ No payment intent created
- ✅ No transaction record created
- ✅ Student not enrolled

**Security Risk:** MEDIUM - User confusion, lost sales

---

#### Test 3.3: Manual Payment Request Flow
**Objective:** Verify manual payment workflow

**Test Steps:**
1. School creates product with payment_provider='manual'
2. Student submits payment request
3. Admin sends payment instructions
4. Admin confirms payment received
5. Admin completes and enrolls student
6. Verify enrollment created

**Expected Results:**
- ✅ Payment request created (status: pending)
- ✅ Admin can send instructions (status: contacted)
- ✅ Admin can confirm payment (status: payment_received)
- ✅ Complete creates transaction (status: successful)
- ✅ Student enrolled in course

**Security Risk:** MEDIUM - Manual process, potential errors

---

#### Test 3.4: Refund Handling
**Objective:** Verify refunds cancel enrollments

**Test Steps:**
1. Student purchases course
2. Transaction successful, enrolled
3. Admin issues refund via Stripe
4. Webhook receives charge.refunded event
5. Check transaction and enrollment status

**Expected Results:**
- ✅ Transaction status updated to 'refunded'
- ✅ Enrollment status updated to 'disabled'
- ✅ Student loses access to course
- ✅ Revenue dashboard reflects refund
- ✅ Audit trail preserved

**Security Risk:** MEDIUM - Customer disputes, fraud

---

#### Test 3.5: Cross-Tenant Payment Prevention
**Objective:** Verify cannot pay for another tenant's products

**Test Steps:**
1. School A has product (ID: 123)
2. Student logged into School B
3. Try to purchase product 123 via API
4. Try to access checkout with School A product ID

**Expected Results:**
- ✅ Checkout validates product.tenant_id matches current tenant
- ✅ API returns 404 or 403
- ✅ Payment intent creation fails
- ✅ No transaction created
- ✅ No enrollment created

**Security Risk:** CRITICAL - Payment fraud, unauthorized access

---

#### Test 3.6: Revenue Split Calculation
**Objective:** Verify platform fee calculated correctly

**Test Steps:**
1. School has custom split (70/30)
2. Student purchases $100 course
3. Check payment intent application_fee_amount
4. Verify transfer amount
5. Check revenue dashboard calculations

**Expected Results:**
- ✅ Platform fee: $30 (30%)
- ✅ Transfer amount: $70 (70%)
- ✅ Revenue dashboard shows $100 total, $70 school share
- ✅ revenue_splits table queried correctly
- ✅ Default 80/20 used if no custom split

**Security Risk:** HIGH - Financial accuracy

---

#### Test 3.7: Payout Tracking
**Objective:** Verify payout webhooks update database

**Test Steps:**
1. Stripe processes payout to school
2. Webhook receives payout.paid event
3. Check payouts table updated
4. Webhook receives payout.failed event
5. Check status updated

**Expected Results:**
- ✅ payout.paid updates status to 'paid'
- ✅ paid_at timestamp set
- ✅ payout.failed updates status to 'failed'
- ✅ Revenue dashboard shows payout history
- ✅ Correct tenant_id in payout record

**Security Risk:** MEDIUM - Financial reporting accuracy

---

### Category 4: Join School Flow (HIGH)

**Priority:** P1 - User Experience Critical
**Total Tests:** 5

#### Test 4.1: Join New School as Existing User
**Objective:** Verify user can join additional schools

**Test Steps:**
1. User already member of School A
2. Visit school-b.localhost:3000
3. Redirected to /join-school
4. Click "Join School B"
5. Verify enrollment and access

**Expected Results:**
- ✅ Middleware detects no membership
- ✅ Auto-redirects to /join-school
- ✅ Shows school info and benefits
- ✅ Join creates tenant_users record
- ✅ Session refreshed with new JWT
- ✅ Can access School B dashboard

**Security Risk:** MEDIUM - User frustration if broken

---

#### Test 4.2: Already Member Detection
**Objective:** Verify "already a member" message works

**Test Steps:**
1. User is member of School A
2. Visit school-a.localhost:3000/join-school
3. Check message and buttons

**Expected Results:**
- ✅ Shows "You're Already a Member!" message
- ✅ Displays school name
- ✅ "Go to Dashboard" and "Browse Courses" buttons
- ✅ No join form shown
- ✅ No duplicate membership created

**Security Risk:** LOW - UX issue only

---

#### Test 4.3: Tenant Switcher Functionality
**Objective:** Verify users can switch between schools

**Test Steps:**
1. User has memberships in School A and School B
2. Currently on School A
3. Click tenant switcher
4. Select School B
5. Verify redirect and context switch

**Expected Results:**
- ✅ Switcher shows both schools
- ✅ Current school highlighted
- ✅ Click updates preferred_tenant_id
- ✅ Session refreshed
- ✅ Redirects to school-b.localhost:3000
- ✅ Dashboard shows School B data

**Security Risk:** MEDIUM - Wrong tenant context

---

#### Test 4.4: Multi-School Dashboard Data
**Objective:** Verify each school shows independent data

**Test Steps:**
1. User member of School A (enrolled in 3 courses)
2. User member of School B (enrolled in 2 courses)
3. View School A dashboard
4. Switch to School B dashboard

**Expected Results:**
- ✅ School A dashboard shows 3 courses
- ✅ School B dashboard shows 2 courses
- ✅ No data mixing between schools
- ✅ Progress tracked independently
- ✅ Certificates issued per school

**Security Risk:** HIGH - Data mixing, user confusion

---

#### Test 4.5: Join Without Authentication
**Objective:** Verify redirect to login

**Test Steps:**
1. Not logged in
2. Visit school-a.localhost:3000/join-school
3. Check redirect

**Expected Results:**
- ✅ Redirects to /auth/login
- ✅ next parameter set to /join-school
- ✅ After login, returns to join page
- ✅ Can complete join flow

**Security Risk:** LOW - UX issue

---

### Category 5: Onboarding Wizard (MEDIUM)

**Priority:** P2 - Conversion Critical
**Total Tests:** 4

#### Test 5.1: Complete Onboarding with Stripe Connect
**Objective:** Verify full onboarding flow

**Test Steps:**
1. New user signs up
2. Navigates to /onboarding
3. Completes all 5 steps
4. Connects Stripe on step 4
5. Finishes onboarding

**Expected Results:**
- ✅ Welcome step shows
- ✅ School info saves to tenant_settings
- ✅ Branding saves (logo, colors)
- ✅ Payment step shows revenue split
- ✅ Stripe Connect redirects work
- ✅ stripe_account_id saved
- ✅ onboarding_completed set to true
- ✅ Redirects to dashboard

**Security Risk:** LOW - Conversion rate impact

---

#### Test 5.2: Skip Payment Setup
**Objective:** Verify skip functionality

**Test Steps:**
1. New user at onboarding
2. Reach payment step (step 4)
3. Click "Skip for Now"
4. Complete onboarding

**Expected Results:**
- ✅ Warning alert shown
- ✅ Can proceed to step 5
- ✅ stripe_account_id remains NULL
- ✅ onboarding_completed = true
- ✅ Revenue dashboard shows connection prompt

**Security Risk:** LOW - User choice

---

#### Test 5.3: Progress Indicator Accuracy
**Objective:** Verify 5-step progress indicator

**Test Steps:**
1. Navigate to onboarding
2. Check progress dots
3. Advance through each step
4. Verify dot activation

**Expected Results:**
- ✅ Shows 5 dots total (not 4)
- ✅ Step 1: 1 dot active
- ✅ Step 4: 4 dots active (payment step)
- ✅ Step 5: All 5 dots active
- ✅ Visual feedback clear

**Security Risk:** NONE - UI only

---

#### Test 5.4: Return to Onboarding
**Objective:** Verify can complete later

**Test Steps:**
1. Start onboarding, complete step 2
2. Close browser
3. Login again
4. Check redirect

**Expected Results:**
- ✅ onboarding_completed = false
- ✅ Redirected to /onboarding
- ✅ Previous data pre-filled
- ✅ Can continue from any step
- ✅ Can complete successfully

**Security Risk:** LOW - UX issue

---

### Category 6: Plan Limits Enforcement (MEDIUM)

**Priority:** P2 - Business Logic Critical
**Total Tests:** 4

#### Test 6.1: Free Plan Limit (5 Courses)
**Objective:** Verify free plan limited to 5 courses

**Test Steps:**
1. School on free plan
2. Create 5 courses successfully
3. Try to create 6th course
4. Check error message

**Expected Results:**
- ✅ Courses 1-5 created successfully
- ✅ Course 6 blocked
- ✅ Error: "Your free plan is limited to 5 courses"
- ✅ UI shows warning at 4/5 (80%)
- ✅ Upgrade prompt displayed

**Security Risk:** LOW - Business rule enforcement

---

#### Test 6.2: Basic Plan Limit (20 Courses)
**Objective:** Verify basic plan limit

**Test Steps:**
1. Upgrade school to basic plan
2. Create 20 courses
3. Try to create 21st course

**Expected Results:**
- ✅ Courses 1-20 created
- ✅ Course 21 blocked
- ✅ Error mentions "basic plan" and "20 courses"
- ✅ Upgrade to professional suggested

**Security Risk:** LOW - Business rule enforcement

---

#### Test 6.3: Enterprise Plan Unlimited
**Objective:** Verify enterprise has no limit

**Test Steps:**
1. School on enterprise plan
2. Create 150 courses
3. Verify no errors

**Expected Results:**
- ✅ All 150 courses created
- ✅ No limit warnings
- ✅ checkCourseLimit returns canCreate: true
- ✅ Infinity limit works

**Security Risk:** LOW - Business rule

---

#### Test 6.4: Server-Side Limit Enforcement
**Objective:** Verify cannot bypass via API

**Test Steps:**
1. School at 5/5 courses (free plan)
2. Try to create course via direct API call
3. Try to bypass client-side check

**Expected Results:**
- ✅ Server action checks limit
- ✅ API returns error
- ✅ Course not created
- ✅ Cannot bypass client-side validation

**Security Risk:** MEDIUM - Enforcement bypass

---

### Category 7: Revenue Dashboard (MEDIUM)

**Priority:** P2 - User Experience
**Total Tests:** 3

#### Test 7.1: Revenue Dashboard Access Control
**Objective:** Verify only teachers/admins can access

**Test Steps:**
1. Login as student
2. Try to access /dashboard/teacher/revenue
3. Login as teacher
4. Access revenue dashboard

**Expected Results:**
- ✅ Student redirected to /dashboard/student
- ✅ Teacher can access revenue page
- ✅ Admin can access revenue page
- ✅ Data shows only current tenant

**Security Risk:** MEDIUM - Unauthorized data access

---

#### Test 7.2: Revenue Calculations Accuracy
**Objective:** Verify revenue split math

**Test Steps:**
1. School has 5 transactions totaling $500
2. Revenue split is 80/20
3. Check dashboard calculations

**Expected Results:**
- ✅ Total revenue: $500
- ✅ Platform fee (20%): $100
- ✅ School revenue (80%): $400
- ✅ Percentages match revenue_splits table
- ✅ Recent revenue (30 days) calculated correctly

**Security Risk:** LOW - Display accuracy

---

#### Test 7.3: Stripe Connection Prompt
**Objective:** Verify warning shown when not connected

**Test Steps:**
1. School without stripe_account_id
2. Teacher accesses revenue dashboard
3. Check warning display

**Expected Results:**
- ✅ Alert shown: "Payment Account Not Connected"
- ✅ "Connect Stripe Account" button visible
- ✅ Links to /api/stripe/connect
- ✅ Warning is dismissible or closeable

**Security Risk:** NONE - UX only

---

### Category 8: Security Audit (CRITICAL)

**Priority:** P0 - Security Assessment
**Total Tests:** 10

#### Test 8.1: SQL Injection Prevention
**Objective:** Verify queries are parameterized

**Test Steps:**
1. Try SQL injection in login email: `' OR '1'='1`
2. Try in course search: `'; DROP TABLE courses;--`
3. Try in product name: `<script>alert('xss')</script>`

**Expected Results:**
- ✅ All queries use parameterized statements
- ✅ No SQL execution from user input
- ✅ Supabase client automatically escapes
- ✅ RLS policies additional protection

**Security Risk:** CRITICAL - Database compromise

---

#### Test 8.2: XSS Prevention
**Objective:** Verify user input is sanitized

**Test Steps:**
1. Create course with name: `<script>alert('xss')</script>`
2. Add lesson with content: `<img src=x onerror=alert('xss')>`
3. View course page and lesson

**Expected Results:**
- ✅ Script tags rendered as text, not executed
- ✅ React escapes HTML by default
- ✅ MDX content safely rendered
- ✅ No alert() popups appear

**Security Risk:** HIGH - Account takeover, malware

---

#### Test 8.3: CSRF Protection
**Objective:** Verify CSRF tokens on forms

**Test Steps:**
1. Check payment forms
2. Check course creation forms
3. Try to submit from external site

**Expected Results:**
- ✅ Forms include CSRF tokens
- ✅ Server validates tokens
- ✅ Cross-origin requests blocked
- ✅ SameSite cookies configured

**Security Risk:** HIGH - Unauthorized actions

---

#### Test 8.4: Rate Limiting
**Objective:** Verify rate limits on sensitive endpoints

**Test Steps:**
1. Make 100 login attempts in 1 minute
2. Make 50 API calls to create courses
3. Check if blocked

**Expected Results:**
- ✅ Rate limiting active on auth endpoints
- ✅ Rate limiting on payment endpoints
- ✅ 429 Too Many Requests returned
- ✅ Retry-After header provided

**Security Risk:** MEDIUM - Brute force, DDoS

---

#### Test 8.5: Sensitive Data Exposure
**Objective:** Verify no sensitive data in client

**Test Steps:**
1. Check API responses
2. Check localStorage/sessionStorage
3. Check browser console logs
4. Inspect network tab

**Expected Results:**
- ✅ No service role keys in client
- ✅ No Stripe secret keys exposed
- ✅ No password hashes in responses
- ✅ No unnecessary PII in logs

**Security Risk:** CRITICAL - Key compromise

---

#### Test 8.6: File Upload Security
**Objective:** Verify file upload validation

**Test Steps:**
1. Try to upload .exe file as logo
2. Try to upload PHP file
3. Upload very large file (> 10MB)
4. Upload with malicious filename

**Expected Results:**
- ✅ Only images allowed for logos
- ✅ File type validation
- ✅ File size limits enforced
- ✅ Filename sanitized
- ✅ Files scanned for malware (if applicable)

**Security Risk:** HIGH - Malware distribution

---

#### Test 8.7: Session Security
**Objective:** Verify session cookies secure

**Test Steps:**
1. Login and inspect cookies
2. Check cookie attributes
3. Try to steal session token

**Expected Results:**
- ✅ Cookies have HttpOnly flag
- ✅ Cookies have Secure flag (HTTPS)
- ✅ SameSite=Lax or Strict
- ✅ Appropriate expiration time
- ✅ Session invalidated on logout

**Security Risk:** CRITICAL - Session hijacking

---

#### Test 8.8: API Authentication
**Objective:** Verify all API routes require auth

**Test Steps:**
1. Call protected API without token
2. Call with expired token
3. Call with invalid token
4. Call with token from different tenant

**Expected Results:**
- ✅ Returns 401 Unauthorized
- ✅ No data leaked in error
- ✅ Tenant validation works
- ✅ Role validation works

**Security Risk:** CRITICAL - Unauthorized access

---

#### Test 8.9: Password Security
**Objective:** Verify password requirements

**Test Steps:**
1. Try to register with weak password "123"
2. Try common password "password123"
3. Check password hashing

**Expected Results:**
- ✅ Minimum length enforced (8+ chars)
- ✅ Complexity requirements (optional)
- ✅ Passwords hashed with bcrypt
- ✅ Never stored in plain text

**Security Risk:** HIGH - Account compromise

---

#### Test 8.10: HTTPS Enforcement
**Objective:** Verify HTTPS redirect

**Test Steps:**
1. Visit http://school-a.localhost:3000
2. Check redirect to HTTPS

**Expected Results:**
- ✅ Redirects to HTTPS (in production)
- ✅ HSTS header set
- ✅ Secure cookies only on HTTPS

**Security Risk:** HIGH - Man-in-the-middle attacks

---

## 📊 Test Execution Matrix

| Category | Total Tests | Priority | Estimated Time | Dependencies |
|----------|-------------|----------|----------------|--------------|
| 1. Multi-Tenant Isolation | 8 | P0 | 4 hours | Test data, 2 schools |
| 2. Authentication | 6 | P0 | 3 hours | Email service |
| 3. Payment Flows | 7 | P0 | 5 hours | Stripe test mode |
| 4. Join School Flow | 5 | P1 | 2 hours | Multi-user setup |
| 5. Onboarding Wizard | 4 | P2 | 2 hours | New accounts |
| 6. Plan Limits | 4 | P2 | 2 hours | Test plans |
| 7. Revenue Dashboard | 3 | P2 | 1 hour | Transaction data |
| 8. Security Audit | 10 | P0 | 6 hours | Security tools |
| **TOTAL** | **47** | - | **25 hours** | - |

---

## 🛠️ Test Environment Setup

### Prerequisites

```bash
# 1. Install Playwright
npm install -D @playwright/test

# 2. Install browsers
npx playwright install

# 3. Set up test database
supabase db reset --db-url test
```

### Test Data Requirements

```sql
-- Create 2 test schools
INSERT INTO tenants (id, name, slug, status) VALUES
  ('test-school-a-id', 'Test School A', 'test-school-a', 'active'),
  ('test-school-b-id', 'Test School B', 'test-school-b', 'active');

-- Create test users
-- (handled by Playwright tests dynamically)

-- Create test courses
-- (handled by Playwright tests dynamically)

-- Create test products
-- (handled by Playwright tests dynamically)
```

### Environment Variables

```bash
# .env.test
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=test-key
SUPABASE_SERVICE_ROLE_KEY=test-service-key
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
NEXT_PUBLIC_PLATFORM_DOMAIN=localhost
```

---

## 📝 Test Execution Order

### Phase 1: Critical Security (Must Pass)
1. Multi-Tenant Isolation (Tests 1.1-1.8)
2. Authentication (Tests 2.1-2.6)
3. Security Audit (Tests 8.1-8.10)

**Blockers:** If ANY test fails, do not proceed

### Phase 2: Payment Security (Must Pass)
1. Payment Flows (Tests 3.1-3.7)

**Blockers:** Critical for revenue model

### Phase 3: User Experience (Should Pass)
1. Join School Flow (Tests 4.1-4.5)
2. Onboarding Wizard (Tests 5.1-5.4)
3. Plan Limits (Tests 6.1-6.4)
4. Revenue Dashboard (Tests 7.1-7.3)

**Blockers:** Fix before production launch

---

## 🚨 Failure Criteria

### Critical Failures (Block Production)
- ❌ Any cross-tenant data leak
- ❌ Authentication bypass
- ❌ Payment fraud vulnerability
- ❌ SQL injection success
- ❌ XSS execution
- ❌ Session hijacking possible

### High Priority Failures (Fix Before Launch)
- ⚠️ Role-based access control bypass
- ⚠️ Revenue calculation errors
- ⚠️ Enrollment isolation issues
- ⚠️ Rate limiting not working

### Medium Priority Failures (Fix Soon)
- 💛 Join school flow errors
- 💛 Onboarding wizard bugs
- 💛 Plan limit bypass
- 💛 Dashboard display errors

---

## 📋 Next Steps

1. **Review and approve this plan**
2. **Set up Playwright test environment**
3. **Write test scripts using Playwright MCP**
4. **Execute Phase 1 tests (Critical Security)**
5. **Execute Phase 2 tests (Payment Security)**
6. **Execute Phase 3 tests (User Experience)**
7. **Generate test report**
8. **Create security audit checklist**
9. **Fix all critical and high-priority issues**
10. **Re-test and verify fixes**

---

**Status:** 📋 Plan Complete - Ready for Execution
**Next Action:** Begin writing Playwright tests for Category 1 (Multi-Tenant Isolation)
