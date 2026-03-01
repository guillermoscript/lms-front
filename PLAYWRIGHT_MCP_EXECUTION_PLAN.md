# Playwright MCP Test Execution Plan

**Created:** 2026-02-16
**Status:** 📋 Ready to Execute
**Tool:** Playwright MCP Browser Tools

---

## Executive Summary

This plan outlines the systematic execution of 47 E2E tests using Playwright MCP browser automation. Tests will be executed in phases based on priority, with results documented at each step.

---

## Pre-Execution Checklist

### 1. Environment Verification

**Server Status:**
- [ ] Next.js dev server running on `http://localhost:3000`
- [ ] No build errors (`npm run build` passes)
- [ ] Environment variables configured in `.env.local`

**Database Status:**
- [ ] Supabase project accessible
- [ ] Database migrations applied
- [ ] RLS policies enabled
- [ ] JWT hook configured

**Browser Status:**
- [ ] Playwright MCP available
- [ ] Browser can navigate to localhost:3000
- [ ] Subdomain routing works (test with any-subdomain.localhost:3000)

**Test Prerequisites:**
- [ ] No existing test data conflicts
- [ ] Stripe test mode keys configured (optional for payment tests)
- [ ] Email service configured (optional for email tests)

### 2. Expected Limitations

**Cannot Test (Will Skip or Mock):**
- Actual email delivery (confirmation, password reset)
- Real Stripe payments (requires test API keys)
- Long session timeouts (would take 30+ minutes)
- Email-based flows that require clicking links

**Will Test:**
- Email request API calls (verify correct parameters)
- Stripe payment intent creation (mocked or with test keys)
- Session management logic
- UI flows and redirects

---

## Execution Strategy

### Phase 1: Environment Validation (5 minutes)

**Goal:** Verify the application is running and accessible

**Tests:**
1. ✅ Navigate to http://localhost:3000
2. ✅ Verify homepage loads
3. ✅ Check navigation to /create-school
4. ✅ Verify subdomain routing (create test school)
5. ✅ Check authentication flow (signup/login)

**Success Criteria:**
- Homepage loads without errors
- School creation works
- Subdomain redirects correctly
- Basic authentication functions

**Failure Handling:**
- If server not running → Start dev server
- If database errors → Check Supabase connection
- If subdomain routing fails → Check proxy.ts middleware

---

### Phase 2: Critical Security Tests (60 minutes)

**Priority:** P0 - Must Pass Before Production

#### 2.1 Multi-Tenant Isolation (8 tests, ~25 min)

**File:** `tests/playwright/multi-tenant-isolation.spec.ts`

**Execution Order:**
1. Test 1.1: Cross-Tenant Course Isolation (CRITICAL)
2. Test 1.2: Cross-Tenant User Data Isolation (CRITICAL)
3. Test 1.3: Cross-Tenant Transaction Isolation (CRITICAL)
4. Test 1.4: Cross-Tenant Product/Plan Isolation
5. Test 1.5: Cross-Tenant Enrollment Isolation
6. Test 1.6: Cross-Tenant Admin Dashboard Isolation
7. Test 1.7: Cross-Tenant Teacher Dashboard Isolation
8. Test 1.8: Cross-Tenant Database Query Validation

**Expected Results:**
- ✅ All tests pass → No cross-tenant data leaks
- ❌ Any test fails → CRITICAL security issue, must fix immediately

**What We're Testing:**
- Students cannot see courses from other schools
- Admins cannot see users from other schools
- Revenue data is isolated per tenant
- Products/plans are tenant-scoped
- All database queries include tenant_id filter

#### 2.2 Authentication Security (6 tests, ~20 min)

**File:** `tests/playwright/authentication-security.spec.ts`

**Execution Order:**
1. Test 2.1: Login Tenant Context Preservation (CRITICAL)
2. Test 2.2: Password Reset Tenant Context
3. Test 2.3: Email Confirmation Tenant Context
4. Test 2.4: Tenant Switcher JWT Refresh (CRITICAL)
5. Test 2.5: Role-Based Access Control (CRITICAL)
6. Test 2.6: Session Expiry and Refresh

**Expected Results:**
- ✅ Login preserves subdomain
- ✅ Password reset includes correct redirectTo
- ✅ Email confirmation sets preferred_tenant_id
- ✅ Tenant switcher refreshes JWT
- ✅ Students cannot access admin routes

**Limitations:**
- Cannot test actual email delivery (verify API params only)
- Session timeout test uses short duration

#### 2.3 Payment Security (7 tests, ~15 min)

**File:** `tests/playwright/payment-security.spec.ts`

**Execution Order:**
1. Test 3.1: Stripe Connect Payment Routing (CRITICAL)
2. Test 3.2: Manual Payment Request Flow
3. Test 3.3: Revenue Split Calculation
4. Test 3.4: Cross-Tenant Purchase Prevention (CRITICAL)
5. Test 3.5: Transaction Tenant Validation (CRITICAL)
6. Test 3.6: Refund Handling
7. Test 3.7: Payment Method Validation

**Expected Results:**
- ✅ Payment intents include tenant context
- ✅ Manual payment flow creates requests
- ✅ Revenue split displayed correctly (20/80)
- ✅ Cannot purchase products from other tenants

**Limitations:**
- Cannot create real Stripe charges (verify API calls only)
- Cannot test actual refunds without live transactions

---

### Phase 3: High Priority Tests (30 minutes)

**Priority:** P1 - Should Pass Before Beta Launch

#### 3.1 Join School Flow (5 tests, ~15 min)

**File:** `tests/playwright/comprehensive-security-audit.spec.ts` (Category 4)

**Execution Order:**
1. Test 4.1: Existing User Join School
2. Test 4.2: Join School Auto-Redirect
3. Test 4.3: Multi-School User List
4. Test 4.4: Join Validation (No Duplicates)
5. Test 4.5: Switch School Flow

**Expected Results:**
- ✅ Users can join multiple schools
- ✅ Non-members auto-redirected to /join-school
- ✅ User sees list of their schools
- ✅ Cannot join same school twice
- ✅ Switching schools refreshes JWT

#### 3.2 Onboarding Wizard (4 tests, ~10 min)

**File:** `tests/playwright/comprehensive-security-audit.spec.ts` (Category 5)

**Execution Order:**
1. Test 5.1: Complete Onboarding Flow
2. Test 5.2: Onboarding Payment Setup Step
3. Test 5.3: Slug Validation
4. Test 5.4: Onboarding Skip Options

**Expected Results:**
- ✅ Wizard creates school successfully
- ✅ Payment setup step visible
- ✅ Duplicate slugs rejected
- ✅ Can skip optional steps

#### 3.3 Plan Limits (4 tests, ~5 min)

**File:** `tests/playwright/comprehensive-security-audit.spec.ts` (Category 6)

**Execution Order:**
1. Test 6.1: Free Plan Course Limit (5 courses)
2. Test 6.2: Plan Upgrade Flow
3. Test 6.3: Plan Limit Display
4. Test 6.4: Enterprise Unlimited Access

**Expected Results:**
- ✅ Cannot create 6th course on free plan
- ✅ Upgrade UI available
- ✅ Limit displayed in UI

---

### Phase 4: Medium Priority Tests (25 minutes)

**Priority:** P2 - Polish and Security Hardening

#### 4.1 Revenue Dashboard (3 tests, ~5 min)

**File:** `tests/playwright/comprehensive-security-audit.spec.ts` (Category 7)

**Execution Order:**
1. Test 7.1: Revenue Dashboard Access
2. Test 7.2: Revenue Split Display
3. Test 7.3: Transaction History Tenant Scoping

**Expected Results:**
- ✅ Teachers/admins can access /dashboard/teacher/revenue
- ✅ 20/80 split displayed
- ✅ Transaction list filtered by tenant

#### 4.2 Security Audit (10 tests, ~20 min)

**File:** `tests/playwright/comprehensive-security-audit.spec.ts` (Category 8)

**Execution Order:**
1. Test 8.1: SQL Injection Prevention
2. Test 8.2: XSS Prevention
3. Test 8.3: CSRF Protection
4. Test 8.4: Authentication Required
5. Test 8.5: Password Strength Requirements
6. Test 8.6: Rate Limiting
7. Test 8.7: Secure Headers
8. Test 8.8: Session Timeout
9. Test 8.9: Audit Logging
10. Test 8.10: Data Export Security

**Expected Results:**
- ✅ SQL injection attempts sanitized
- ✅ XSS scripts not executed
- ✅ Protected routes require auth
- ✅ Weak passwords rejected
- ✅ Security headers present

---

## Execution Phases Timeline

| Phase | Priority | Tests | Time | Start | End |
|-------|----------|-------|------|-------|-----|
| 1. Environment | Setup | 5 | 5 min | 0:00 | 0:05 |
| 2.1. Multi-Tenant | P0 | 8 | 25 min | 0:05 | 0:30 |
| 2.2. Authentication | P0 | 6 | 20 min | 0:30 | 0:50 |
| 2.3. Payment | P0 | 7 | 15 min | 0:50 | 1:05 |
| 3.1. Join School | P1 | 5 | 15 min | 1:05 | 1:20 |
| 3.2. Onboarding | P1 | 4 | 10 min | 1:20 | 1:30 |
| 3.3. Plan Limits | P1 | 4 | 5 min | 1:30 | 1:35 |
| 4.1. Revenue | P2 | 3 | 5 min | 1:35 | 1:40 |
| 4.2. Security | P2 | 10 | 20 min | 1:40 | 2:00 |
| **Total** | | **47** | **2h** | | |

---

## Test Execution with Playwright MCP

### Using MCP Browser Tools

**Available MCP Tools:**
- `mcp__playwright__browser_navigate` - Navigate to URLs
- `mcp__playwright__browser_snapshot` - Get page accessibility snapshot
- `mcp__playwright__browser_click` - Click elements
- `mcp__playwright__browser_type` - Type text
- `mcp__playwright__browser_fill_form` - Fill multiple form fields
- `mcp__playwright__browser_take_screenshot` - Take screenshots
- `mcp__playwright__browser_evaluate` - Run JavaScript
- `mcp__playwright__browser_console_messages` - Get console logs
- `mcp__playwright__browser_network_requests` - Get network requests

### Example Test Flow

**Test 1.1: Cross-Tenant Course Isolation**

```markdown
1. Navigate to http://localhost:3000/create-school
2. Take snapshot to see form
3. Fill form: name="Math Academy", slug="math-academy"
4. Click "Create School" button
5. Verify redirect to math-academy.localhost:3000
6. Navigate to /dashboard/teacher/courses/new
7. Fill form: title="Math 101"
8. Click "Create Course"
9. Capture course ID from URL
10. Open new browser context (incognito)
11. Create School B with "Science Academy"
12. Create student at School A
13. Try to access School B course from School A subdomain
14. Verify access denied (404 or redirect)
15. Take screenshot of result
```

### Result Documentation

For each test, document:
- ✅ **PASS** - Test completed successfully, expected behavior verified
- ❌ **FAIL** - Test failed, actual behavior differs from expected
- ⚠️ **SKIP** - Test skipped due to limitations (e.g., email delivery)
- 🔄 **PARTIAL** - Test partially completed (some assertions pass, others fail)

**Failure Documentation Template:**
```markdown
## Test X.X: Test Name - ❌ FAIL

**Expected:** User cannot access School B course
**Actual:** User can access School B course (cross-tenant leak!)
**Screenshot:** test-results/test-X-X-failure.png
**Console Logs:** [error logs]
**Network Requests:** [API calls made]

**Root Cause:** Missing .eq('tenant_id', tenantId) filter in query
**Fix Required:** Add tenant filter to app/[locale]/dashboard/student/courses/[id]/page.tsx
**Priority:** CRITICAL - Security Issue
```

---

## Failure Criteria & Actions

### Critical Failures (Stop Testing, Fix Immediately)

**If ANY of these tests fail:**
- Test 1.1: Cross-Tenant Course Isolation
- Test 1.2: Cross-Tenant User Data Isolation
- Test 1.3: Cross-Tenant Transaction Isolation
- Test 2.1: Login Tenant Context
- Test 2.4: Tenant Switcher JWT Refresh
- Test 2.5: Role-Based Access Control
- Test 3.1: Stripe Connect Payment Routing
- Test 3.4: Cross-Tenant Purchase Prevention
- Test 3.5: Transaction Tenant Validation

**Action:** STOP testing, fix issue, re-run failed test + all related tests

### High Priority Failures (Continue Testing, Fix Before Beta)

**If these tests fail:**
- Join school flow tests
- Authentication context tests
- Payment method validation

**Action:** Continue testing, document failure, add to fix backlog

### Medium/Low Priority Failures (Fix Before GA)

**If these tests fail:**
- Onboarding wizard tests
- Plan limits tests
- Security audit tests (non-critical)

**Action:** Continue testing, document as enhancement

---

## Environment Setup Before Execution

### 1. Start Development Server

```bash
# Terminal 1
cd /Users/guillermomarin/Documents/GitHub/lms-front
npm run dev
```

Wait for: "Ready started server on 0.0.0.0:3000"

### 2. Verify Database Connection

```bash
# Check Supabase connection
curl $NEXT_PUBLIC_SUPABASE_URL/rest/v1/ \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
```

Should return: `{"message":"The server is running"}`

### 3. Check Environment Variables

```bash
# Verify .env.local has required vars
cat .env.local | grep -E "SUPABASE|STRIPE|PLATFORM"
```

### 4. Clean Database (Optional)

```bash
# Remove test data from previous runs
supabase db reset  # WARNING: Destructive!

# OR manually clean:
# DELETE FROM tenants WHERE slug LIKE '%-test%';
```

---

## Post-Execution Tasks

### 1. Generate Test Report

**Collect:**
- Total tests run: 47
- Tests passed: X
- Tests failed: Y
- Tests skipped: Z
- Screenshots: test-results/*.png
- Console logs: .playwright-mcp/console-*.log

### 2. Categorize Failures

**Critical (P0):**
- List of failed critical tests
- Root cause analysis
- Immediate fix plan

**High (P1):**
- List of failed high-priority tests
- Fix timeline (before beta)

**Medium/Low (P2):**
- List of failed tests
- Enhancement backlog

### 3. Create Action Items

For each failure:
- [ ] Test name
- [ ] File/line to fix
- [ ] Expected fix
- [ ] Assigned to
- [ ] Due date

### 4. Update Documentation

- [ ] Update MEMORY.md with new bugs found
- [ ] Update test plan with actual results
- [ ] Create GitHub issues for failures

---

## Success Criteria

### Minimum for Production Launch

- ✅ All 21 P0 tests passing (multi-tenant, auth, payment security)
- ✅ 0 critical security vulnerabilities
- ✅ All cross-tenant isolation tests passing
- ✅ Authentication preserves tenant context
- ✅ Payments route to correct schools

### Ideal for Production Launch

- ✅ 40+ of 47 tests passing (85%+)
- ✅ All P0 and P1 tests passing
- ✅ Documented plan for P2 failures
- ✅ No known data leaks

---

## Ready to Execute

**Command to start:**
```markdown
Begin test execution with Phase 1: Environment Validation
```

I will use Playwright MCP browser tools to:
1. Navigate to localhost:3000
2. Create test schools
3. Execute each test systematically
4. Document results with screenshots
5. Generate comprehensive test report

**Estimated Total Time:** 2 hours
**Start Time:** [Ready when you say go]
