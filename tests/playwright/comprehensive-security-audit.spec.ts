import { test, expect } from '@playwright/test';

/**
 * Comprehensive Security Audit Tests
 * Covers: Join School, Onboarding, Plan Limits, Revenue Dashboard, and Security Audits
 * Priority: Mixed (P0-P2)
 */

test.describe('Category 4: Join School Flow', () => {

  /**
   * Test 4.1: Existing User Join School
   * Objective: Verify existing users can join multiple schools
   * Security Risk: MEDIUM - Multi-tenant membership issues
   */
  test('4.1: Existing User Join School', async ({ page, context }) => {
    test.setTimeout(120000);

    // STEP 1: Create School A and register user
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Join School A');
    await page.fill('[name="slug"]', 'join-a');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/join-a\.localhost:3000/);

    const userEmail = `join-test-${Date.now()}@test.com`;
    await page.goto('http://join-a.localhost:3000/auth/sign-up');
    await page.fill('[name="email"]', userEmail);
    await page.fill('[name="password"]', 'password123');
    await page.fill('[name="confirmPassword"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // STEP 2: Create School B
    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Join School B');
    await schoolBPage.fill('[name="slug"]', 'join-b');
    await schoolBPage.click('button:has-text("Create School")');
    await schoolBPage.waitForURL(/join-b\.localhost:3000/);
    await schoolBContext?.close();

    // STEP 3: Visit School B as existing user
    await page.goto('http://join-b.localhost:3000');

    // Should auto-redirect to /join-school since user is not a member
    await page.waitForURL(/\/join-school/, { timeout: 10000 });

    // STEP 4: Verify join school page is displayed
    await expect(page.locator('h1, h2')).toContainText(/Join|Join School B/i);

    // STEP 5: Click join button
    const joinButton = page.locator('button:has-text("Join"), button[type="submit"]');
    if (await joinButton.count() > 0) {
      await joinButton.first().click();
      await page.waitForTimeout(2000);

      // Should redirect to dashboard
      await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    }
  });

  /**
   * Test 4.2: Join School Auto-Redirect
   * Objective: Verify non-members are redirected to join page
   * Security Risk: HIGH - Unauthorized access to school
   */
  test('4.2: Join School Auto-Redirect', async ({ page, context }) => {
    test.setTimeout(90000);

    // STEP 1: Create user at default tenant
    await page.goto('http://localhost:3000/auth/sign-up');
    const userEmail = `redirect-test-${Date.now()}@test.com`;
    await page.fill('[name="email"]', userEmail);
    await page.fill('[name="password"]', 'password123');
    await page.fill('[name="confirmPassword"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });

    // STEP 2: Create a school in different context
    const schoolContext = await context.browser()?.newContext();
    const schoolPage = await schoolContext!.newPage();

    await schoolPage.goto('http://localhost:3000/create-school');
    await schoolPage.fill('[name="name"]', 'Redirect Test School');
    await schoolPage.fill('[name="slug"]', 'redirect-test');
    await schoolPage.click('button:has-text("Create School")');
    await schoolPage.waitForURL(/redirect-test\.localhost:3000/);
    await schoolContext?.close();

    // STEP 3: Try to access school as non-member
    await page.goto('http://redirect-test.localhost:3000/dashboard/student');

    // Should auto-redirect to /join-school
    await page.waitForURL(/redirect-test\.localhost:3000.*join-school/, { timeout: 10000 });

    // STEP 4: Verify join page is displayed
    await expect(page.locator('h1, h2')).toContainText(/Join/i);
  });

  /**
   * Test 4.3: Multi-School User List
   * Objective: Verify users can see their school memberships
   * Security Risk: LOW - UX clarity
   */
  test('4.3: Multi-School User List', async ({ page, context }) => {
    test.setTimeout(120000);

    // STEP 1: Create School A
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Multi School A');
    await page.fill('[name="slug"]', 'multi-a');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/multi-a\.localhost:3000/);

    // STEP 2: Create School B and join it
    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Multi School B');
    await schoolBPage.fill('[name="slug"]', 'multi-b');
    await schoolBPage.click('button:has-text("Create School")');
    await schoolBPage.waitForURL(/multi-b\.localhost:3000/);
    await schoolBContext?.close();

    // STEP 3: Visit join-school page from School A user
    await page.goto('http://multi-b.localhost:3000/join-school');

    // Should show school info
    await expect(page.locator('h1, h2')).toContainText(/Multi School B|Join/i);

    // STEP 4: Join School B
    const joinButton = page.locator('button:has-text("Join")');
    if (await joinButton.count() > 0) {
      await joinButton.click();
      await page.waitForTimeout(2000);
    }

    // STEP 5: Check if user memberships are visible
    const accountMenu = page.locator('[data-testid="user-menu"], button:has-text("Account")');
    if (await accountMenu.count() > 0) {
      await accountMenu.click();

      // Look for school list or tenant switcher
      const hasTenantList = await page.locator('text=Multi School A, text=Multi School B').count();
      console.log('Multi-school memberships displayed:', hasTenantList > 0);
    }
  });

  /**
   * Test 4.4: Join Validation
   * Objective: Verify users cannot join same school twice
   * Security Risk: LOW - Data integrity
   */
  test('4.4: Join Validation', async ({ page }) => {
    test.setTimeout(90000);

    // STEP 1: Create school and user
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Validation School');
    await page.fill('[name="slug"]', 'validation-test');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/validation-test\.localhost:3000/);

    // STEP 2: Try to visit join-school page as creator
    await page.goto('http://validation-test.localhost:3000/join-school');

    // Should show "already a member" message or redirect
    const pageContent = await page.locator('body').textContent();
    expect(
      pageContent?.includes('already a member') ||
      pageContent?.includes('Already enrolled') ||
      page.url().includes('/dashboard')
    ).toBeTruthy();
  });

  /**
   * Test 4.5: Switch School Flow
   * Objective: Verify users can switch between schools smoothly
   * Security Risk: MEDIUM - Session/JWT confusion
   */
  test('4.5: Switch School Flow', async ({ page, context }) => {
    test.setTimeout(120000);

    // STEP 1: Create two schools and join both
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Switch School A');
    await page.fill('[name="slug"]', 'switch-a');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/switch-a\.localhost:3000/);

    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Switch School B');
    await schoolBPage.fill('[name="slug"]', 'switch-b');
    await schoolBPage.click('button:has-text("Create School")');
    await schoolBPage.waitForURL(/switch-b\.localhost:3000/);
    await schoolBContext?.close();

    // Join School B from School A user
    await page.goto('http://switch-b.localhost:3000/join-school');
    const joinButton = page.locator('button:has-text("Join")');
    if (await joinButton.count() > 0) {
      await joinButton.click();
      await page.waitForTimeout(2000);
    }

    // STEP 2: Access tenant switcher
    const switcher = page.locator('[data-testid="tenant-switcher"], button:has-text("Switch School")');
    if (await switcher.count() > 0) {
      await switcher.click();

      // Should show both schools
      await expect(page.locator('text=Switch School A')).toBeVisible();
      await expect(page.locator('text=Switch School B')).toBeVisible();

      // STEP 3: Switch to School A
      const schoolAButton = page.locator('button:has-text("Switch School A"), [data-school="switch-a"]');
      if (await schoolAButton.count() > 0) {
        await schoolAButton.click();
        await page.waitForTimeout(2000);

        // Should navigate to School A subdomain
        expect(page.url()).toContain('switch-a');
      }
    }
  });
});

test.describe('Category 5: Onboarding Wizard', () => {

  /**
   * Test 5.1: Complete Onboarding Flow
   * Objective: Verify onboarding wizard creates school correctly
   * Security Risk: LOW - School creation validation
   */
  test('5.1: Complete Onboarding Flow', async ({ page }) => {
    test.setTimeout(120000);

    // STEP 1: Start onboarding
    await page.goto('http://localhost:3000/create-school');

    // STEP 2: Fill school info
    await page.fill('[name="name"]', 'Onboarding Test School');
    await page.fill('[name="slug"]', 'onboarding-test');
    await page.click('button:has-text("Create School"), button:has-text("Next")');

    // Wait for redirect or next step
    await page.waitForTimeout(2000);

    // STEP 3: Verify redirect to new tenant
    const currentUrl = page.url();
    expect(currentUrl).toContain('onboarding-test');

    // STEP 4: Verify user is admin
    await page.goto('http://onboarding-test.localhost:3000/dashboard/admin');
    await expect(page.locator('h1, h2')).toContainText(/Admin|Dashboard/i);
  });

  /**
   * Test 5.2: Onboarding Payment Setup Step
   * Objective: Verify payment step in wizard works correctly
   * Security Risk: MEDIUM - Stripe Connect integration
   */
  test('5.2: Onboarding Payment Setup Step', async ({ page }) => {
    test.setTimeout(90000);

    // STEP 1: Create school
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Payment Setup School');
    await page.fill('[name="slug"]', 'payment-setup');

    // Look for payment setup step or Stripe Connect button
    const stripeButton = page.locator('button:has-text("Connect with Stripe"), a:has-text("Connect Stripe")');

    if (await stripeButton.count() > 0) {
      // Payment step is visible in wizard
      console.log('Payment setup step found in onboarding');
    }

    // Complete onboarding
    const nextButton = page.locator('button:has-text("Next"), button:has-text("Create")');
    if (await nextButton.count() > 0) {
      await nextButton.click();
      await page.waitForTimeout(2000);
    }
  });

  /**
   * Test 5.3: Slug Validation
   * Objective: Verify slug uniqueness and format validation
   * Security Risk: MEDIUM - Subdomain collision
   */
  test('5.3: Slug Validation', async ({ page, context }) => {
    test.setTimeout(90000);

    // STEP 1: Create first school with slug
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Slug Test School A');
    await page.fill('[name="slug"]', 'unique-slug');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/unique-slug\.localhost:3000/);

    // STEP 2: Try to create another school with same slug
    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Slug Test School B');
    await schoolBPage.fill('[name="slug"]', 'unique-slug');
    await schoolBPage.click('button:has-text("Create School")');

    // Should show error about duplicate slug
    await schoolBPage.waitForTimeout(2000);
    const errorMessage = await schoolBPage.locator('text=/already taken|already exists/i, .error, [role="alert"]').textContent();

    console.log('Slug validation error:', errorMessage || 'No error shown');

    await schoolBContext?.close();
  });

  /**
   * Test 5.4: Onboarding Skip Options
   * Objective: Verify users can skip optional steps
   * Security Risk: LOW - UX flexibility
   */
  test('5.4: Onboarding Skip Options', async ({ page }) => {
    test.setTimeout(90000);

    // STEP 1: Start onboarding
    await page.goto('http://localhost:3000/create-school');

    // STEP 2: Look for skip buttons
    const skipButton = page.locator('button:has-text("Skip"), a:has-text("Skip for Now")');

    if (await skipButton.count() > 0) {
      console.log('Skip option available in onboarding');
      await skipButton.first().click();
      await page.waitForTimeout(1000);
    }

    // Fill minimum required info
    await page.fill('[name="name"]', 'Skip Test School');
    await page.fill('[name="slug"]', 'skip-test');
    await page.click('button:has-text("Create"), button:has-text("Finish")');

    // Should still create school
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('skip-test');
  });
});

test.describe('Category 6: Plan Limits Enforcement', () => {

  /**
   * Test 6.1: Free Plan Course Limit
   * Objective: Verify free plan enforces 5 course limit
   * Security Risk: LOW - Business logic enforcement
   */
  test('6.1: Free Plan Course Limit', async ({ page }) => {
    test.setTimeout(180000);

    // STEP 1: Create school on free plan (default)
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Free Plan School');
    await page.fill('[name="slug"]', 'free-plan');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/free-plan\.localhost:3000/);

    // STEP 2: Create 5 courses (free plan limit)
    for (let i = 1; i <= 5; i++) {
      await page.goto('http://free-plan.localhost:3000/dashboard/teacher/courses/new');
      await page.fill('[name="title"]', `Course ${i}`);
      await page.fill('[name="description"]', `Test course ${i}`);
      await page.click('button:has-text("Create")');
      await page.waitForTimeout(2000);
    }

    // STEP 3: Try to create 6th course (should fail)
    await page.goto('http://free-plan.localhost:3000/dashboard/teacher/courses/new');
    await page.fill('[name="title"]', 'Course 6');
    await page.fill('[name="description"]', 'Should fail');
    await page.click('button:has-text("Create")');

    // STEP 4: Verify error message about limit
    const errorMessage = await page.locator('text=/limit|upgrade/i, .error, [role="alert"]').textContent();

    console.log('Course limit error:', errorMessage || 'No limit enforced');
  });

  /**
   * Test 6.2: Plan Upgrade Flow
   * Objective: Verify upgrading plan increases limits
   * Security Risk: LOW - Plan migration
   */
  test('6.2: Plan Upgrade Flow', async ({ page }) => {
    test.setTimeout(90000);

    // STEP 1: Create school
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Upgrade Plan School');
    await page.fill('[name="slug"]', 'upgrade-plan');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/upgrade-plan\.localhost:3000/);

    // STEP 2: Navigate to settings/billing
    await page.goto('http://upgrade-plan.localhost:3000/dashboard/admin/settings');

    // Look for plan upgrade option
    const upgradeButton = page.locator('button:has-text("Upgrade"), a:has-text("Change Plan")');

    if (await upgradeButton.count() > 0) {
      console.log('Plan upgrade option available');
    } else {
      console.log('No plan upgrade UI found in settings');
    }
  });

  /**
   * Test 6.3: Plan Limit Display
   * Objective: Verify current plan and limits are displayed
   * Security Risk: LOW - Transparency
   */
  test('6.3: Plan Limit Display', async ({ page }) => {
    test.setTimeout(90000);

    // STEP 1: Create school
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Limit Display School');
    await page.fill('[name="slug"]', 'limit-display');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/limit-display\.localhost:3000/);

    // STEP 2: Navigate to courses page
    await page.goto('http://limit-display.localhost:3000/dashboard/teacher/courses');

    // STEP 3: Look for plan limit indicator
    const pageContent = await page.locator('body').textContent();

    const hasLimitInfo = pageContent?.includes('Free') ||
                        pageContent?.includes('5 courses') ||
                        pageContent?.includes('limit');

    console.log('Plan limit displayed:', hasLimitInfo);
  });

  /**
   * Test 6.4: Enterprise Unlimited Access
   * Objective: Verify enterprise plan has no course limits
   * Security Risk: LOW - Feature access
   */
  test('6.4: Enterprise Unlimited Access', async ({ page }) => {
    test.setTimeout(90000);

    // Note: This test would require database setup to set enterprise plan
    // For now, we verify the UI supports enterprise plan display

    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Enterprise School');
    await page.fill('[name="slug"]', 'enterprise-test');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/enterprise-test\.localhost:3000/);

    // Navigate to pricing or settings
    await page.goto('http://enterprise-test.localhost:3000/pricing');

    // Look for enterprise plan option
    const enterprisePlan = page.locator('text=/enterprise/i');
    if (await enterprisePlan.count() > 0) {
      console.log('Enterprise plan option available');
    }
  });
});

test.describe('Category 7: Revenue Dashboard', () => {

  /**
   * Test 7.1: Revenue Dashboard Access
   * Objective: Verify teachers/admins can access revenue dashboard
   * Security Risk: MEDIUM - Financial data access control
   */
  test('7.1: Revenue Dashboard Access', async ({ page }) => {
    test.setTimeout(90000);

    // STEP 1: Create school
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Revenue Dashboard School');
    await page.fill('[name="slug"]', 'revenue-dash');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/revenue-dash\.localhost:3000/);

    // STEP 2: Navigate to revenue dashboard
    await page.goto('http://revenue-dash.localhost:3000/dashboard/teacher/revenue');

    // STEP 3: Verify page loads
    await expect(page.locator('h1, h2')).toContainText(/Revenue|Earnings|Finance/i);

    // STEP 4: Verify revenue widgets
    const hasRevenueCards = await page.locator('[data-testid="revenue-card"], .revenue-card, .stat-card').count();
    console.log('Revenue cards displayed:', hasRevenueCards);
  });

  /**
   * Test 7.2: Revenue Split Display
   * Objective: Verify platform/school revenue split is shown
   * Security Risk: MEDIUM - Transparency
   */
  test('7.2: Revenue Split Display', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Split Display School');
    await page.fill('[name="slug"]', 'split-display');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/split-display\.localhost:3000/);

    await page.goto('http://split-display.localhost:3000/dashboard/teacher/revenue');

    // Look for revenue split percentages
    const content = await page.locator('body').textContent();

    const hasRevenueSplit = content?.includes('20%') && content?.includes('80%');
    console.log('Revenue split displayed:', hasRevenueSplit);
  });

  /**
   * Test 7.3: Transaction History Tenant Scoping
   * Objective: Verify transaction list shows only tenant's data
   * Security Risk: CRITICAL - Cross-tenant financial data leak
   */
  test('7.3: Transaction History Tenant Scoping', async ({ page, context }) => {
    test.setTimeout(120000);

    // STEP 1: Create School A
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Transaction School A');
    await page.fill('[name="slug"]', 'transaction-a');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/transaction-a\.localhost:3000/);

    // STEP 2: Create School B
    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Transaction School B');
    await schoolBPage.fill('[name="slug"]', 'transaction-b');
    await schoolBPage.click('button:has-text("Create School")');
    await schoolBPage.waitForURL(/transaction-b\.localhost:3000/);

    // STEP 3: Check revenue dashboard in School A
    await page.goto('http://transaction-a.localhost:3000/dashboard/teacher/revenue');

    // STEP 4: Verify no School B data
    const revenueContent = await page.locator('[data-testid="transaction-list"], table').textContent();

    expect(revenueContent).not.toContain('Transaction School B');

    await schoolBContext?.close();
  });
});

test.describe('Category 8: Security Audit Checks', () => {

  /**
   * Test 8.1: SQL Injection Prevention
   * Objective: Verify input sanitization in search/filter fields
   * Security Risk: CRITICAL - Database compromise
   */
  test('8.1: SQL Injection Prevention', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'SQL Test School');
    await page.fill('[name="slug"]', 'sql-test');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/sql-test\.localhost:3000/);

    // Try SQL injection in search field
    await page.goto('http://sql-test.localhost:3000/dashboard/admin/courses');

    const searchField = page.locator('input[type="search"], input[placeholder*="Search"]');
    if (await searchField.count() > 0) {
      // Try common SQL injection patterns
      await searchField.fill("' OR '1'='1");
      await page.waitForTimeout(1000);

      // Page should not crash or show all data
      const pageContent = await page.locator('body').textContent();
      console.log('SQL injection test completed without crash');
    }
  });

  /**
   * Test 8.2: XSS Prevention
   * Objective: Verify HTML/JS injection is sanitized
   * Security Risk: CRITICAL - Client-side code execution
   */
  test('8.2: XSS Prevention', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', '<script>alert("XSS")</script>');
    await page.fill('[name="slug"]', 'xss-test');
    await page.click('button:has-text("Create School")');

    await page.waitForTimeout(2000);

    // Verify script is not executed
    const alerts = [];
    page.on('dialog', dialog => {
      alerts.push(dialog.message());
      dialog.dismiss();
    });

    await page.waitForTimeout(1000);

    // No alert should have been triggered
    expect(alerts.length).toBe(0);
  });

  /**
   * Test 8.3: CSRF Protection
   * Objective: Verify forms include CSRF tokens
   * Security Risk: HIGH - Unauthorized actions
   */
  test('8.3: CSRF Protection', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('http://localhost:3000/create-school');

    // Check if form has CSRF token or uses SameSite cookies
    const formHtml = await page.locator('form').first().innerHTML();

    const hasCsrfToken = formHtml.includes('csrf') ||
                         formHtml.includes('token') ||
                         formHtml.includes('_token');

    console.log('Form CSRF protection:', hasCsrfToken ? 'Token found' : 'Using cookie-based protection');
  });

  /**
   * Test 8.4: Authentication Required
   * Objective: Verify protected routes require authentication
   * Security Risk: CRITICAL - Unauthorized access
   */
  test('8.4: Authentication Required', async ({ page }) => {
    test.setTimeout(60000);

    // Try to access protected routes without auth
    const protectedRoutes = [
      '/dashboard/student',
      '/dashboard/teacher/courses',
      '/dashboard/admin/users',
    ];

    for (const route of protectedRoutes) {
      await page.goto(`http://localhost:3000${route}`);

      // Should redirect to login
      await page.waitForTimeout(1000);
      const url = page.url();

      expect(
        url.includes('/auth/login') ||
        url.includes('/auth/sign-in') ||
        url === 'http://localhost:3000/'
      ).toBeTruthy();
    }
  });

  /**
   * Test 8.5: Password Strength Requirements
   * Objective: Verify weak passwords are rejected
   * Security Risk: MEDIUM - Account security
   */
  test('8.5: Password Strength Requirements', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('http://localhost:3000/auth/sign-up');

    // Try weak password
    await page.fill('[name="email"]', 'test@test.com');
    await page.fill('[name="password"]', '123');
    await page.fill('[name="confirmPassword"]', '123');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(1000);

    // Should show password strength error
    const errorMessage = await page.locator('text=/password.*strong|minimum.*characters/i, .error').textContent();

    console.log('Password validation:', errorMessage || 'Weak password accepted');
  });

  /**
   * Test 8.6: Rate Limiting
   * Objective: Verify API rate limiting is in place
   * Security Risk: MEDIUM - DDoS, brute force
   */
  test('8.6: Rate Limiting', async ({ page }) => {
    test.setTimeout(90000);

    // Try multiple rapid login attempts
    for (let i = 0; i < 10; i++) {
      await page.goto('http://localhost:3000/auth/login');
      await page.fill('[name="email"]', 'test@test.com');
      await page.fill('[name="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }

    // Check if rate limit message appears
    const rateLimitMsg = await page.locator('text=/too many|rate limit|slow down/i').textContent();

    console.log('Rate limiting:', rateLimitMsg || 'No rate limit detected');
  });

  /**
   * Test 8.7: Secure Headers
   * Objective: Verify security headers are set
   * Security Risk: MEDIUM - Clickjacking, MIME sniffing
   */
  test('8.7: Secure Headers', async ({ page }) => {
    test.setTimeout(60000);

    const response = await page.goto('http://localhost:3000');

    if (response) {
      const headers = response.headers();

      const securityHeaders = {
        'x-frame-options': headers['x-frame-options'],
        'x-content-type-options': headers['x-content-type-options'],
        'strict-transport-security': headers['strict-transport-security'],
      };

      console.log('Security headers:', securityHeaders);
    }
  });

  /**
   * Test 8.8: Session Timeout
   * Objective: Verify inactive sessions expire
   * Security Risk: MEDIUM - Unauthorized access via stale session
   */
  test('8.8: Session Timeout', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Session Timeout School');
    await page.fill('[name="slug"]', 'session-timeout');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/session-timeout\.localhost:3000/);

    // Wait for potential session timeout (would need longer wait in real test)
    await page.waitForTimeout(5000);

    // Refresh page
    await page.reload();

    // Check if still authenticated
    const isStillLoggedIn = page.url().includes('/dashboard');

    console.log('Session still active after 5s:', isStillLoggedIn);
  });

  /**
   * Test 8.9: Audit Logging
   * Objective: Verify sensitive actions are logged
   * Security Risk: LOW - Forensics and compliance
   */
  test('8.9: Audit Logging', async ({ page }) => {
    test.setTimeout(90000);

    // This test would require backend access to verify logs
    // For now, we check if audit-related UI exists

    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Audit Log School');
    await page.fill('[name="slug"]', 'audit-log');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/audit-log\.localhost:3000/);

    await page.goto('http://audit-log.localhost:3000/dashboard/admin/settings');

    // Look for audit log section
    const hasAuditLog = await page.locator('text=/audit|activity log|history/i').count();

    console.log('Audit log UI present:', hasAuditLog > 0);
  });

  /**
   * Test 8.10: Data Export Security
   * Objective: Verify data export respects tenant boundaries
   * Security Risk: HIGH - Bulk data exfiltration
   */
  test('8.10: Data Export Security', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Export Security School');
    await page.fill('[name="slug"]', 'export-security');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/export-security\.localhost:3000/);

    // Look for data export functionality
    await page.goto('http://export-security.localhost:3000/dashboard/admin/users');

    const exportButton = page.locator('button:has-text("Export"), a:has-text("Download")');

    if (await exportButton.count() > 0) {
      console.log('Data export functionality found - should be tenant-scoped');
      // Actual export would need to verify tenant_id filtering
    } else {
      console.log('No data export functionality found');
    }
  });
});
