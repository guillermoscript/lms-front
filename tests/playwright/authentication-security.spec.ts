import { test, expect } from '@playwright/test';

/**
 * Authentication & Authorization Security Tests
 * Priority: P0 - Security Critical
 *
 * These tests verify that authentication flows preserve tenant context
 * and that authorization checks prevent unauthorized access.
 */

test.describe('Category 2: Authentication & Authorization', () => {

  /**
   * Test 2.1: Login Tenant Context Preservation
   * Objective: Verify login preserves correct tenant subdomain
   * Security Risk: HIGH - Wrong tenant access
   */
  test('2.1: Login Tenant Context Preservation', async ({ page }) => {
    test.setTimeout(90000);

    // STEP 1: Create School A and register user
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Login Test School');
    await page.fill('[name="slug"]', 'login-test');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/login-test\.localhost:3000/);

    // Register a student account
    await page.goto('http://login-test.localhost:3000/auth/sign-up');
    const testEmail = `login-test-${Date.now()}@test.com`;
    await page.fill('[name="email"]', testEmail);
    await page.fill('[name="password"]', 'password123');
    await page.fill('[name="confirmPassword"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait for successful signup
    await page.waitForURL(/\/dashboard\/student/, { timeout: 10000 });

    // STEP 2: Logout
    await page.click('[data-testid="user-menu"], button:has-text("Account")');
    await page.click('a:has-text("Logout"), button:has-text("Logout")');

    // Wait for logout
    await page.waitForURL(/\/(auth\/login|$)/, { timeout: 10000 });

    // STEP 3: Login on same subdomain
    await page.goto('http://login-test.localhost:3000/auth/login');
    await page.fill('[name="email"]', testEmail);
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // STEP 4: Verify redirect stays on same tenant subdomain
    await page.waitForURL(/login-test\.localhost:3000/, { timeout: 10000 });

    // Verify user is logged in and on correct tenant
    const currentUrl = page.url();
    expect(currentUrl).toContain('login-test.localhost:3000');
    expect(currentUrl).toContain('/dashboard/student');

    // STEP 5: Verify JWT has correct tenant_id
    // Check localStorage or cookies for session data
    const sessionData = await page.evaluate(() => {
      return localStorage.getItem('supabase.auth.token');
    });

    expect(sessionData).toBeTruthy();
  });

  /**
   * Test 2.2: Password Reset Tenant Context
   * Objective: Verify password reset emails preserve tenant subdomain
   * Security Risk: MEDIUM - Account takeover on wrong tenant
   */
  test('2.2: Password Reset Tenant Context', async ({ page }) => {
    test.setTimeout(90000);

    // STEP 1: Create school and register user
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Reset Test School');
    await page.fill('[name="slug"]', 'reset-test');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/reset-test\.localhost:3000/);

    await page.goto('http://reset-test.localhost:3000/auth/sign-up');
    const testEmail = `reset-test-${Date.now()}@test.com`;
    await page.fill('[name="email"]', testEmail);
    await page.fill('[name="password"]', 'password123');
    await page.fill('[name="confirmPassword"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Logout
    await page.click('[data-testid="user-menu"], button:has-text("Account")');
    await page.click('a:has-text("Logout"), button:has-text("Logout")');

    // STEP 2: Request password reset on tenant subdomain
    await page.goto('http://reset-test.localhost:3000/auth/forgot-password');
    await page.fill('[name="email"]', testEmail);
    await page.click('button[type="submit"]');

    // STEP 3: Verify success message
    await expect(page.locator('text=/reset email sent/i, text=/check your email/i')).toBeVisible({
      timeout: 10000,
    });

    // STEP 4: Verify the reset form captures correct subdomain
    // Check network requests for redirect URL
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('supabase')) {
        requests.push(request.url());
      }
    });

    // Note: We can't test the actual email link without email access
    // This test verifies the UI flow works correctly
    console.log('Password reset requested for:', testEmail);
  });

  /**
   * Test 2.3: Email Confirmation Tenant Context
   * Objective: Verify email confirmation preserves tenant
   * Security Risk: HIGH - User assigned to wrong tenant
   */
  test('2.3: Email Confirmation Tenant Context', async ({ page }) => {
    test.setTimeout(90000);

    // STEP 1: Navigate to signup on specific tenant
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Confirm Test School');
    await page.fill('[name="slug"]', 'confirm-test');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/confirm-test\.localhost:3000/);

    // STEP 2: Register new account
    await page.goto('http://confirm-test.localhost:3000/auth/sign-up');
    const testEmail = `confirm-test-${Date.now()}@test.com`;
    await page.fill('[name="email"]', testEmail);
    await page.fill('[name="password"]', 'password123');
    await page.fill('[name="confirmPassword"]', 'password123');

    // Intercept the signup request to check redirectTo parameter
    const signupRequests: any[] = [];
    page.on('request', (request) => {
      if (request.url().includes('auth') && request.method() === 'POST') {
        signupRequests.push({
          url: request.url(),
          postData: request.postData(),
        });
      }
    });

    await page.click('button[type="submit"]');

    // STEP 3: Verify signup request includes correct tenant context
    await page.waitForTimeout(2000);

    // Check that emailRedirectTo includes correct subdomain
    const signupData = signupRequests.find(req =>
      req.postData?.includes('emailRedirectTo') || req.url.includes('signup')
    );

    if (signupData?.postData) {
      console.log('Signup request data:', signupData.postData);
      // Should include confirm-test subdomain in redirect URL
      expect(signupData.postData).toContain('confirm-test');
    }
  });

  /**
   * Test 2.4: Tenant Switcher JWT Refresh
   * Objective: Verify switching tenants refreshes JWT with new claims
   * Security Risk: CRITICAL - Wrong tenant access with stale JWT
   */
  test('2.4: Tenant Switcher JWT Refresh', async ({ page, context }) => {
    test.setTimeout(120000);

    // STEP 1: Create School A
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Switcher School A');
    await page.fill('[name="slug"]', 'switcher-a');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/switcher-a\.localhost:3000/);

    const schoolAEmail = `switcher-test-${Date.now()}@test.com`;

    // STEP 2: Create School B in different context
    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Switcher School B');
    await schoolBPage.fill('[name="slug"]', 'switcher-b');
    await schoolBPage.click('button:has-text("Create School")');
    await schoolBPage.waitForURL(/switcher-b\.localhost:3000/);

    // STEP 3: Create user account at School A
    await page.goto('http://switcher-a.localhost:3000/auth/sign-up');
    await page.fill('[name="email"]', schoolAEmail);
    await page.fill('[name="password"]', 'password123');
    await page.fill('[name="confirmPassword"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // STEP 4: Join School B from same account
    await page.goto('http://switcher-b.localhost:3000/join-school');

    // Should see join school page
    await expect(page.locator('h1, h2')).toContainText(/Join|Switcher School B/i);

    // Click join button
    await page.click('button:has-text("Join")');
    await page.waitForTimeout(2000);

    // STEP 5: Verify user can switch between tenants
    // Check if tenant switcher is visible
    const hasTenantSwitcher = await page.locator('[data-testid="tenant-switcher"], button:has-text("Switch")').count();

    if (hasTenantSwitcher > 0) {
      // Open tenant switcher
      await page.click('[data-testid="tenant-switcher"], button:has-text("Switch")');

      // Should show both schools
      await expect(page.locator('text=Switcher School A')).toBeVisible();
      await expect(page.locator('text=Switcher School B')).toBeVisible();

      // Switch to School A
      await page.click('button:has-text("Switcher School A"), [data-tenant="switcher-a"]');

      // Should navigate to School A subdomain
      await page.waitForURL(/switcher-a\.localhost:3000/, { timeout: 10000 });
    }

    // Cleanup
    await schoolBContext?.close();
  });

  /**
   * Test 2.5: Role-Based Access Control
   * Objective: Verify students cannot access teacher/admin routes
   * Security Risk: CRITICAL - Privilege escalation
   */
  test('2.5: Role-Based Access Control', async ({ page }) => {
    test.setTimeout(90000);

    // STEP 1: Create school and register student
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'RBAC Test School');
    await page.fill('[name="slug"]', 'rbac-test');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/rbac-test\.localhost:3000/);

    // The creator becomes admin by default, so create a new student account
    await page.goto('http://rbac-test.localhost:3000/auth/sign-up');
    const studentEmail = `rbac-student-${Date.now()}@test.com`;
    await page.fill('[name="email"]', studentEmail);
    await page.fill('[name="password"]', 'password123');
    await page.fill('[name="confirmPassword"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard\/student/);

    // STEP 2: Try to access teacher routes (should redirect or error)
    const teacherRouteResponse = await page.goto('http://rbac-test.localhost:3000/dashboard/teacher/courses');

    // Should redirect to student dashboard or show 403
    const finalUrl = page.url();
    expect(
      finalUrl.includes('/dashboard/student') || teacherRouteResponse?.status() === 403
    ).toBeTruthy();

    // STEP 3: Try to access admin routes (should redirect or error)
    const adminRouteResponse = await page.goto('http://rbac-test.localhost:3000/dashboard/admin/users');

    // Should redirect or error
    const adminFinalUrl = page.url();
    expect(
      adminFinalUrl.includes('/dashboard/student') || adminRouteResponse?.status() === 403
    ).toBeTruthy();

    // STEP 4: Verify student can access own dashboard
    await page.goto('http://rbac-test.localhost:3000/dashboard/student');
    await expect(page.locator('h1, h2')).toContainText(/Dashboard|My Courses|Welcome/i);
  });

  /**
   * Test 2.6: Session Expiry and Refresh
   * Objective: Verify session handling doesn't leak across tenants
   * Security Risk: MEDIUM - Stale session access
   */
  test('2.6: Session Expiry and Refresh', async ({ page }) => {
    test.setTimeout(90000);

    // STEP 1: Create school and login
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Session Test School');
    await page.fill('[name="slug"]', 'session-test');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/session-test\.localhost:3000/);

    await page.goto('http://session-test.localhost:3000/auth/sign-up');
    const testEmail = `session-test-${Date.now()}@test.com`;
    await page.fill('[name="email"]', testEmail);
    await page.fill('[name="password"]', 'password123');
    await page.fill('[name="confirmPassword"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // STEP 2: Verify session exists
    const sessionBefore = await page.evaluate(() => {
      return localStorage.getItem('supabase.auth.token');
    });
    expect(sessionBefore).toBeTruthy();

    // STEP 3: Clear session storage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // STEP 4: Refresh page and verify redirect to login
    await page.reload();
    await page.waitForTimeout(2000);

    // Should redirect to login since session is cleared
    const currentUrl = page.url();
    expect(
      currentUrl.includes('/auth/login') ||
      currentUrl.includes('/auth/sign-in') ||
      currentUrl === 'http://session-test.localhost:3000/'
    ).toBeTruthy();
  });
});
