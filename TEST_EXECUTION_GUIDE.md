# Test Execution Guide

**Created:** 2026-02-16
**Status:** ✅ Ready for Execution
**Total Tests:** 47 comprehensive security and functional tests

---

## Overview

This guide provides instructions for running the comprehensive E2E test suite for the multi-tenant LMS platform. The test suite validates:

- Multi-tenant data isolation
- Authentication and authorization security
- Payment flow security (Stripe Connect + Manual)
- Join school flow
- Onboarding wizard
- Plan limits enforcement
- Revenue dashboard
- Security audit checks

---

## Test Files

### 1. Multi-Tenant Isolation Tests
**File:** `tests/playwright/multi-tenant-isolation.spec.ts`
**Tests:** 8
**Priority:** P0 - Security Critical

**Coverage:**
- Cross-tenant course isolation
- Cross-tenant user data isolation
- Cross-tenant transaction isolation
- Cross-tenant product/plan isolation
- Cross-tenant enrollment isolation
- Admin dashboard isolation
- Teacher dashboard isolation
- Database query validation

### 2. Authentication Security Tests
**File:** `tests/playwright/authentication-security.spec.ts`
**Tests:** 6
**Priority:** P0 - Security Critical

**Coverage:**
- Login tenant context preservation
- Password reset tenant context
- Email confirmation tenant context
- Tenant switcher JWT refresh
- Role-based access control (RBAC)
- Session expiry and refresh

### 3. Payment Security Tests
**File:** `tests/playwright/payment-security.spec.ts`
**Tests:** 7
**Priority:** P0 - Security Critical

**Coverage:**
- Stripe Connect payment routing
- Manual payment request flow
- Revenue split calculation
- Cross-tenant purchase prevention
- Transaction tenant validation
- Refund handling
- Payment method validation

### 4. Comprehensive Security Audit Tests
**File:** `tests/playwright/comprehensive-security-audit.spec.ts`
**Tests:** 26
**Priority:** Mixed (P0-P2)

**Coverage:**
- **Join School Flow (5 tests)**
  - Existing user join school
  - Auto-redirect for non-members
  - Multi-school user list
  - Join validation (no duplicates)
  - Switch school flow

- **Onboarding Wizard (4 tests)**
  - Complete onboarding flow
  - Payment setup step
  - Slug validation
  - Skip options

- **Plan Limits Enforcement (4 tests)**
  - Free plan course limit (5 courses)
  - Plan upgrade flow
  - Plan limit display
  - Enterprise unlimited access

- **Revenue Dashboard (3 tests)**
  - Revenue dashboard access
  - Revenue split display (20/80)
  - Transaction history tenant scoping

- **Security Audit Checks (10 tests)**
  - SQL injection prevention
  - XSS prevention
  - CSRF protection
  - Authentication required
  - Password strength requirements
  - Rate limiting
  - Secure headers
  - Session timeout
  - Audit logging
  - Data export security

---

## Prerequisites

### 1. Environment Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

### 2. Environment Variables

Ensure `.env.local` has:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe (test mode)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Platform domain for subdomain routing
NEXT_PUBLIC_PLATFORM_DOMAIN=localhost:3000
```

### 3. Start Development Server

```bash
# Terminal 1: Start Next.js dev server
npm run dev
```

The server must be running on `http://localhost:3000` for tests to execute.

### 4. Database State

**Important:** Tests will create schools, users, courses, etc. in the database.

**Recommended:** Use a test/staging Supabase project, not production.

To reset database between test runs:
```bash
# Option 1: Drop and recreate tables (destructive)
supabase db reset

# Option 2: Manual cleanup via SQL
# DELETE FROM tenants WHERE slug LIKE '%-test%';
```

---

## Running Tests

### Run All Tests

```bash
npx playwright test
```

### Run Specific Test File

```bash
# Multi-tenant isolation tests only
npx playwright test tests/playwright/multi-tenant-isolation.spec.ts

# Authentication tests only
npx playwright test tests/playwright/authentication-security.spec.ts

# Payment tests only
npx playwright test tests/playwright/payment-security.spec.ts

# Comprehensive audit tests only
npx playwright test tests/playwright/comprehensive-security-audit.spec.ts
```

### Run Specific Test

```bash
# Run test by name
npx playwright test -g "Cross-Tenant Course Isolation"

# Run test by category
npx playwright test -g "Category 1"
npx playwright test -g "Category 2"
```

### Run in UI Mode (Interactive)

```bash
npx playwright test --ui
```

This opens an interactive UI where you can:
- Select tests to run
- Watch tests execute step-by-step
- Debug failures
- Inspect DOM snapshots

### Run in Debug Mode

```bash
# Debug specific test
npx playwright test --debug -g "Cross-Tenant Course Isolation"
```

### Run in Headed Mode (See Browser)

```bash
npx playwright test --headed
```

---

## Test Execution Matrix

### Phase 1: Critical Security (Priority P0)
**Estimated Time:** 60 minutes

| Test File | Tests | Priority | Time |
|-----------|-------|----------|------|
| `multi-tenant-isolation.spec.ts` | 8 | P0 | 25 min |
| `authentication-security.spec.ts` | 6 | P0 | 20 min |
| `payment-security.spec.ts` | 7 | P0 | 15 min |

**Command:**
```bash
npx playwright test tests/playwright/multi-tenant-isolation.spec.ts
npx playwright test tests/playwright/authentication-security.spec.ts
npx playwright test tests/playwright/payment-security.spec.ts
```

### Phase 2: User Flows (Priority P1)
**Estimated Time:** 30 minutes

| Test Suite | Tests | Priority | Time |
|------------|-------|----------|------|
| Join School Flow | 5 | P1 | 15 min |
| Onboarding Wizard | 4 | P1 | 10 min |
| Plan Limits | 4 | P1 | 5 min |

**Command:**
```bash
npx playwright test tests/playwright/comprehensive-security-audit.spec.ts -g "Category 4"
npx playwright test tests/playwright/comprehensive-security-audit.spec.ts -g "Category 5"
npx playwright test tests/playwright/comprehensive-security-audit.spec.ts -g "Category 6"
```

### Phase 3: Security Audit (Priority P0-P2)
**Estimated Time:** 25 minutes

| Test Suite | Tests | Priority | Time |
|------------|-------|----------|------|
| Revenue Dashboard | 3 | P1 | 5 min |
| Security Audit | 10 | P0-P2 | 20 min |

**Command:**
```bash
npx playwright test tests/playwright/comprehensive-security-audit.spec.ts -g "Category 7"
npx playwright test tests/playwright/comprehensive-security-audit.spec.ts -g "Category 8"
```

---

## Interpreting Results

### Successful Test Run

```
Running 47 tests using 2 workers

  ✓ tests/playwright/multi-tenant-isolation.spec.ts (8/8)
  ✓ tests/playwright/authentication-security.spec.ts (6/6)
  ✓ tests/playwright/payment-security.spec.ts (7/7)
  ✓ tests/playwright/comprehensive-security-audit.spec.ts (26/26)

  47 passed (25m)
```

### Failed Test Example

```
  ✗ 1.1: Cross-Tenant Course Isolation
    Error: expect(received).not.toContain(expected)

    Expected substring: not "Science 201"
    Received string: "Math 101, Science 201"

    This indicates a CRITICAL security issue - cross-tenant data leak!
```

---

## Failure Criteria

### Critical (Must Fix Before Launch)

- **Any test in Category 1 (Multi-Tenant Isolation) fails**
  - Risk: Cross-tenant data leaks
  - Action: Fix immediately, re-run all isolation tests

- **Any test in Category 2 (Authentication) fails**
  - Risk: Authentication bypass, tenant confusion
  - Action: Fix authentication flow, verify JWT claims

- **Tests 3.1, 3.4, 3.5 (Payment Security) fail**
  - Risk: Revenue misdirection, unauthorized purchases
  - Action: Fix payment routing, verify tenant_id validation

### High Priority (Fix Before Beta)

- **Join School Flow failures**
  - Risk: UX issues, incorrect tenant assignment
  - Action: Fix join/switch logic

- **Payment Method Validation failures**
  - Risk: Payment routing errors
  - Action: Verify multi-provider support

### Medium Priority (Fix Before GA)

- **Plan Limits failures**
  - Risk: Business logic not enforced
  - Action: Implement limit checks

- **Revenue Dashboard failures**
  - Risk: Incorrect financial reporting
  - Action: Fix revenue queries

### Low Priority (Nice to Have)

- **Onboarding wizard skip options**
- **Audit logging UI**

---

## Test Reports

### HTML Report

```bash
# Generate HTML report
npx playwright test --reporter=html

# Open report
npx playwright show-report
```

### JSON Report

```bash
npx playwright test --reporter=json > test-results.json
```

### CI/CD Integration

**GitHub Actions Example:**

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npx playwright test
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          # ... other env vars

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Debugging Failed Tests

### 1. Enable Trace Viewer

```bash
npx playwright test --trace on
```

After test run:
```bash
npx playwright show-trace trace.zip
```

### 2. Take Screenshots on Failure

Tests already configured with:
```typescript
use: {
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
}
```

Screenshots saved to: `test-results/`

### 3. Inspect Test Step-by-Step

```bash
npx playwright test --debug -g "failing test name"
```

### 4. Check Console Logs

Tests log important info to console:
```typescript
console.log('Payment requests intercepted:', paymentRequests.length);
console.log('Revenue split displayed:', hasRevenueSplit);
```

### 5. Verify Database State

If tests fail due to data issues:
```sql
-- Check tenant_id is set
SELECT tenant_id, COUNT(*) FROM courses GROUP BY tenant_id;

-- Check JWT claims
SELECT raw_app_meta_data FROM auth.users WHERE email = 'test@test.com';

-- Check tenant_users memberships
SELECT * FROM tenant_users WHERE user_id = 'uuid';
```

---

## Known Limitations

### 1. Email Confirmation

Tests cannot verify actual email confirmation links without email service access.

**Workaround:** Test validates `emailRedirectTo` parameter includes correct subdomain.

### 2. Stripe Test Mode

Tests cannot create real Stripe payments without test API keys.

**Workaround:** Tests validate payment routing logic and UI flows.

### 3. Subdomain Routing

Playwright tests use `localhost` with subdomain patterns like `school-a.localhost:3000`.

**Requirement:** Ensure `proxy.ts` middleware handles localhost subdomain routing.

### 4. Session Timeout

Full session timeout tests require extended wait times (30+ minutes).

**Workaround:** Tests verify session management logic with shorter waits.

---

## Next Steps After Testing

### 1. Fix Critical Failures

- Address all P0 test failures
- Re-run failing tests to verify fixes
- Run full suite to ensure no regressions

### 2. Document Edge Cases

- Add any discovered edge cases to MEMORY.md
- Update test plan with new scenarios

### 3. Performance Testing

- Run tests with `--workers=1` to check serial execution
- Monitor test execution time
- Optimize slow tests

### 4. CI/CD Integration

- Add tests to GitHub Actions workflow
- Set up test result reporting
- Configure failure notifications

### 5. Security Review

- Review all P0 security test results with security team
- Penetration testing for tenant isolation
- Third-party security audit

---

## Test Maintenance

### When to Update Tests

- **New features added:** Add tests for new functionality
- **Schema changes:** Update tests that interact with affected tables
- **Authentication changes:** Update auth flow tests
- **Payment provider changes:** Update payment flow tests

### Test Data Cleanup

Tests create temporary data with patterns like:
- Schools: `*-test-school`, `*-test`
- Users: `*-test-@test.com`

**Cleanup Script (TODO):**
```sql
-- Clean up test data
DELETE FROM tenants WHERE slug LIKE '%-test%';
DELETE FROM profiles WHERE email LIKE '%-test@%';
-- Add more cleanup as needed
```

---

## Support

**Issues with tests?**

1. Check test logs in `test-results/`
2. Review Playwright trace: `npx playwright show-trace`
3. Verify environment variables in `.env.local`
4. Check database state via Supabase dashboard
5. Review test documentation in `E2E_TESTING_AND_SECURITY_AUDIT_PLAN.md`

**Found a bug in tests?**

- Document in GitHub issues
- Update test to reflect correct behavior
- Re-run test suite

---

## Summary

✅ **47 comprehensive tests** covering all critical security scenarios
✅ **4 test files** organized by category
✅ **~2 hours** estimated total execution time
✅ **Production-ready** test suite for multi-tenant LMS platform

**Execute tests regularly** to ensure multi-tenant security and data isolation remain intact as the platform evolves.
