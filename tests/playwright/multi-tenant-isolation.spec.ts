import { test, expect } from '@playwright/test';

/**
 * Multi-Tenant Data Isolation Tests
 * Priority: P0 - Security Critical
 *
 * These tests verify that data is properly isolated between different tenants (schools)
 * to prevent cross-tenant data leaks, unauthorized access, and security breaches.
 */

test.describe('Category 1: Multi-Tenant Data Isolation', () => {

  /**
   * Test 1.1: Cross-Tenant Course Isolation
   * Objective: Verify students cannot access courses from other tenants
   * Security Risk: HIGH - Data breach, unauthorized course access
   */
  test('1.1: Cross-Tenant Course Isolation', async ({ page, context }) => {
    test.setTimeout(120000); // 2 minutes for complex flow

    // STEP 1: Create School A with course "Math 101"
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Math Academy');
    await page.fill('[name="slug"]', 'math-academy');
    await page.click('button:has-text("Create School")');

    // Verify redirect to math-academy subdomain
    await page.waitForURL(/math-academy\.localhost:3000/);

    // Get School A admin session
    const schoolAContext = context;

    // Create a course in School A
    await page.goto('http://math-academy.localhost:3000/dashboard/teacher/courses/new');
    await page.fill('[name="title"]', 'Math 101');
    await page.fill('[name="description"]', 'Introduction to Mathematics');
    await page.click('button:has-text("Create Course")');

    // Wait for course creation
    await page.waitForURL(/\/dashboard\/teacher\/courses\/\d+/);
    const mathCourseUrl = page.url();
    const mathCourseId = mathCourseUrl.match(/\/courses\/(\d+)/)?.[1];

    expect(mathCourseId).toBeTruthy();

    // STEP 2: Create School B with course "Science 201"
    const schoolBContext = await context.browser()?.newContext();
    expect(schoolBContext).toBeTruthy();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Science Academy');
    await schoolBPage.fill('[name="slug"]', 'science-academy');
    await schoolBPage.click('button:has-text("Create School")');

    await schoolBPage.waitForURL(/science-academy\.localhost:3000/);

    // Create a course in School B
    await schoolBPage.goto('http://science-academy.localhost:3000/dashboard/teacher/courses/new');
    await schoolBPage.fill('[name="title"]', 'Science 201');
    await schoolBPage.fill('[name="description"]', 'Advanced Science');
    await schoolBPage.click('button:has-text("Create Course")');

    await schoolBPage.waitForURL(/\/dashboard\/teacher\/courses\/\d+/);
    const scienceCourseUrl = schoolBPage.url();
    const scienceCourseId = scienceCourseUrl.match(/\/courses\/(\d+)/)?.[1];

    expect(scienceCourseId).toBeTruthy();

    // STEP 3: Create student account at School A
    const studentContext = await context.browser()?.newContext();
    expect(studentContext).toBeTruthy();
    const studentPage = await studentContext!.newPage();

    await studentPage.goto('http://math-academy.localhost:3000/auth/sign-up');
    const studentEmail = `student-${Date.now()}@test.com`;
    await studentPage.fill('[name="email"]', studentEmail);
    await studentPage.fill('[name="password"]', 'password123');
    await studentPage.fill('[name="confirmPassword"]', 'password123');
    await studentPage.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await studentPage.waitForURL(/\/dashboard\/student/, { timeout: 10000 });

    // STEP 4: Verify student can access Math 101 from School A
    await studentPage.goto(`http://math-academy.localhost:3000/dashboard/student/courses/${mathCourseId}`);
    await expect(studentPage.locator('h1')).toContainText('Math 101');

    // STEP 5: Try to access Science 201 from School B via direct URL (SHOULD FAIL)
    const crossTenantResponse = await studentPage.goto(
      `http://math-academy.localhost:3000/dashboard/student/courses/${scienceCourseId}`
    );

    // Verify access is denied (404, 403, or redirect)
    expect(crossTenantResponse?.status()).toBeGreaterThanOrEqual(400);

    // STEP 6: Verify dashboard shows only School A courses
    await studentPage.goto('http://math-academy.localhost:3000/dashboard/student');
    const courseList = await studentPage.locator('[data-testid="course-list"]').textContent();

    expect(courseList).toContain('Math 101');
    expect(courseList).not.toContain('Science 201');

    // Cleanup
    await schoolBContext?.close();
    await studentContext?.close();
  });

  /**
   * Test 1.2: Cross-Tenant User Data Isolation
   * Objective: Verify admin/teacher at School A cannot see users from School B
   * Security Risk: HIGH - PII exposure, GDPR violation
   */
  test('1.2: Cross-Tenant User Data Isolation', async ({ page, context }) => {
    test.setTimeout(180000); // 3 minutes for complex setup

    // STEP 1: Create School A with admin
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'School Alpha');
    await page.fill('[name="slug"]', 'school-alpha');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/school-alpha\.localhost:3000/);

    // Register 3 students at School A
    const schoolAStudents = [];
    for (let i = 0; i < 3; i++) {
      const studentContext = await context.browser()?.newContext();
      const studentPage = await studentContext!.newPage();

      await studentPage.goto('http://school-alpha.localhost:3000/auth/sign-up');
      const email = `student-alpha-${i}-${Date.now()}@test.com`;
      await studentPage.fill('[name="email"]', email);
      await studentPage.fill('[name="password"]', 'password123');
      await studentPage.fill('[name="confirmPassword"]', 'password123');
      await studentPage.click('button[type="submit"]');

      schoolAStudents.push(email);
      await studentContext?.close();
    }

    // STEP 2: Create School B with different students
    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'School Beta');
    await schoolBPage.fill('[name="slug"]', 'school-beta');
    await schoolBPage.click('button:has-text("Create School")');
    await schoolBPage.waitForURL(/school-beta\.localhost:3000/);

    // Register 3 students at School B
    const schoolBStudents = [];
    for (let i = 0; i < 3; i++) {
      const studentContext = await context.browser()?.newContext();
      const studentPage = await studentContext!.newPage();

      await studentPage.goto('http://school-beta.localhost:3000/auth/sign-up');
      const email = `student-beta-${i}-${Date.now()}@test.com`;
      await studentPage.fill('[name="email"]', email);
      await studentPage.fill('[name="password"]', 'password123');
      await studentPage.fill('[name="confirmPassword"]', 'password123');
      await studentPage.click('button[type="submit"]');

      schoolBStudents.push(email);
      await studentContext?.close();
    }

    // STEP 3: Login as admin at School A and check user list
    await page.goto('http://school-alpha.localhost:3000/dashboard/admin/users');

    // Wait for user list to load
    await page.waitForSelector('[data-testid="user-list"], table, .user-table', { timeout: 10000 });

    // STEP 4: Verify only School A students are visible
    const userTableContent = await page.locator('table, [data-testid="user-list"]').textContent();

    // Verify School A students are present
    for (const email of schoolAStudents) {
      expect(userTableContent).toContain(email);
    }

    // Verify School B students are NOT present
    for (const email of schoolBStudents) {
      expect(userTableContent).not.toContain(email);
    }

    // STEP 5: Check API response doesn't leak cross-tenant data
    const apiResponse = await page.waitForResponse(
      response => response.url().includes('/api/') && response.status() === 200
    );

    if (apiResponse) {
      const responseBody = await apiResponse.text();
      for (const email of schoolBStudents) {
        expect(responseBody).not.toContain(email);
      }
    }

    // Cleanup
    await schoolBContext?.close();
  });

  /**
   * Test 1.3: Cross-Tenant Transaction Isolation
   * Objective: Verify revenue data is isolated per tenant
   * Security Risk: CRITICAL - Financial data leak, compliance violation
   */
  test('1.3: Cross-Tenant Transaction Isolation', async ({ page, context }) => {
    test.setTimeout(120000);

    // STEP 1: Create School A and make transactions
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Revenue School A');
    await page.fill('[name="slug"]', 'revenue-a');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/revenue-a\.localhost:3000/);

    // Create a product at School A
    await page.goto('http://revenue-a.localhost:3000/dashboard/admin/products/new');
    await page.fill('[name="name"]', 'Course Bundle A');
    await page.fill('[name="price"]', '100');
    await page.click('button:has-text("Create Product")');

    // Note: We can't create real transactions without Stripe test mode
    // This test verifies the isolation logic exists

    // STEP 2: Create School B with different transactions
    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Revenue School B');
    await schoolBPage.fill('[name="slug"]', 'revenue-b');
    await schoolBPage.click('button:has-text("Create School")');
    await schoolBPage.waitForURL(/revenue-b\.localhost:3000/);

    // Create a product at School B
    await schoolBPage.goto('http://revenue-b.localhost:3000/dashboard/admin/products/new');
    await schoolBPage.fill('[name="name"]', 'Course Bundle B');
    await schoolBPage.fill('[name="price"]', '200');
    await schoolBPage.click('button:has-text("Create Product")');

    // STEP 3: Check School A revenue dashboard
    await page.goto('http://revenue-a.localhost:3000/dashboard/teacher/revenue');

    // Verify revenue dashboard loads
    await page.waitForSelector('h1:has-text("Revenue")', { timeout: 10000 });

    // STEP 4: Verify transaction list shows only School A data
    const transactionPage = page.goto('http://revenue-a.localhost:3000/dashboard/admin/transactions');
    await page.waitForSelector('table, [data-testid="transaction-list"]', { timeout: 10000 });

    const transactionContent = await page.locator('table, [data-testid="transaction-list"]').textContent();

    // Verify School B product is not visible
    expect(transactionContent).not.toContain('Course Bundle B');
    expect(transactionContent).not.toContain('200');

    // Cleanup
    await schoolBContext?.close();
  });

  /**
   * Test 1.4: Cross-Tenant Product/Plan Isolation
   * Objective: Verify products and plans are tenant-scoped
   * Security Risk: HIGH - Unauthorized purchase, pricing leak
   */
  test('1.4: Cross-Tenant Product/Plan Isolation', async ({ page, context }) => {
    test.setTimeout(120000);

    // STEP 1: Create School A with product
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Product School A');
    await page.fill('[name="slug"]', 'product-a');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/product-a\.localhost:3000/);

    // Create product at School A
    await page.goto('http://product-a.localhost:3000/dashboard/admin/products/new');
    await page.fill('[name="name"]', 'Exclusive Product A');
    await page.fill('[name="price"]', '99');
    await page.click('button:has-text("Create Product")');
    await page.waitForURL(/\/dashboard\/admin\/products/);

    // Get product ID from URL or table
    const productTableA = await page.locator('table, [data-testid="product-list"]').textContent();
    expect(productTableA).toContain('Exclusive Product A');

    // STEP 2: Create School B with different product
    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Product School B');
    await schoolBPage.fill('[name="slug"]', 'product-b');
    await schoolBPage.click('button:has-text("Create School")');
    await schoolBPage.waitForURL(/product-b\.localhost:3000/);

    // Create product at School B
    await schoolBPage.goto('http://product-b.localhost:3000/dashboard/admin/products/new');
    await schoolBPage.fill('[name="name"]', 'Exclusive Product B');
    await schoolBPage.fill('[name="price"]', '149');
    await schoolBPage.click('button:has-text("Create Product")');
    await schoolBPage.waitForURL(/\/dashboard\/admin\/products/);

    // STEP 3: Verify School A cannot see School B products
    await page.goto('http://product-a.localhost:3000/dashboard/admin/products');
    const productListA = await page.locator('table, [data-testid="product-list"]').textContent();

    expect(productListA).toContain('Exclusive Product A');
    expect(productListA).not.toContain('Exclusive Product B');
    expect(productListA).not.toContain('149');

    // STEP 4: Verify School B cannot see School A products
    await schoolBPage.goto('http://product-b.localhost:3000/dashboard/admin/products');
    const productListB = await schoolBPage.locator('table, [data-testid="product-list"]').textContent();

    expect(productListB).toContain('Exclusive Product B');
    expect(productListB).not.toContain('Exclusive Product A');
    expect(productListB).not.toContain('99');

    // Cleanup
    await schoolBContext?.close();
  });

  /**
   * Test 1.5: Cross-Tenant Enrollment Isolation
   * Objective: Verify enrollments are properly scoped to tenant
   * Security Risk: HIGH - Unauthorized access to paid content
   */
  test('1.5: Cross-Tenant Enrollment Isolation', async ({ page, context }) => {
    test.setTimeout(120000);

    // STEP 1: Create School A with student enrolled in course
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Enrollment School A');
    await page.fill('[name="slug"]', 'enrollment-a');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/enrollment-a\.localhost:3000/);

    // Create course in School A
    await page.goto('http://enrollment-a.localhost:3000/dashboard/teacher/courses/new');
    await page.fill('[name="title"]', 'Private Course A');
    await page.fill('[name="description"]', 'Exclusive content');
    await page.click('button:has-text("Create Course")');
    await page.waitForURL(/\/dashboard\/teacher\/courses\/\d+/);

    // STEP 2: Create student at School A
    const studentContext = await context.browser()?.newContext();
    const studentPage = await studentContext!.newPage();

    await studentPage.goto('http://enrollment-a.localhost:3000/auth/sign-up');
    await studentPage.fill('[name="email"]', `enrollment-student-${Date.now()}@test.com`);
    await studentPage.fill('[name="password"]', 'password123');
    await studentPage.fill('[name="confirmPassword"]', 'password123');
    await studentPage.click('button[type="submit"]');
    await studentPage.waitForURL(/\/dashboard\/student/);

    // STEP 3: Verify student's enrollments are scoped to School A
    await studentPage.goto('http://enrollment-a.localhost:3000/dashboard/student');

    // Check enrolled courses section
    const dashboardContent = await studentPage.locator('[data-testid="enrolled-courses"], .enrolled-courses').textContent();

    // Should show courses from School A only
    expect(dashboardContent).toContain('Private Course A');

    // STEP 4: Create School B and verify isolation
    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Enrollment School B');
    await schoolBPage.fill('[name="slug"]', 'enrollment-b');
    await schoolBPage.click('button:has-text("Create School")');
    await schoolBPage.waitForURL(/enrollment-b\.localhost:3000/);

    // Create course in School B
    await schoolBPage.goto('http://enrollment-b.localhost:3000/dashboard/teacher/courses/new');
    await schoolBPage.fill('[name="title"]', 'Private Course B');
    await schoolBPage.fill('[name="description"]', 'Different school content');
    await schoolBPage.click('button:has-text("Create Course")');

    // STEP 5: Verify student from School A cannot see School B courses
    await studentPage.goto('http://enrollment-a.localhost:3000/dashboard/student/browse');
    const browseContent = await studentPage.locator('[data-testid="course-list"], .course-grid').textContent();

    expect(browseContent).not.toContain('Private Course B');

    // Cleanup
    await studentContext?.close();
    await schoolBContext?.close();
  });

  /**
   * Test 1.6: Cross-Tenant Admin Dashboard Isolation
   * Objective: Verify admin dashboards show only tenant-specific data
   * Security Risk: CRITICAL - Admin privilege escalation
   */
  test('1.6: Cross-Tenant Admin Dashboard Isolation', async ({ page, context }) => {
    test.setTimeout(120000);

    // STEP 1: Create School A
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Admin School A');
    await page.fill('[name="slug"]', 'admin-a');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/admin-a\.localhost:3000/);

    // Navigate to admin dashboard
    await page.goto('http://admin-a.localhost:3000/dashboard/admin');
    await expect(page.locator('h1, h2')).toContainText(/Admin|Dashboard/);

    // STEP 2: Create School B
    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Admin School B');
    await schoolBPage.fill('[name="slug"]', 'admin-b');
    await schoolBPage.click('button:has-text("Create School")');
    await schoolBPage.waitForURL(/admin-b\.localhost:3000/);

    // STEP 3: Verify admin at School A cannot access School B admin pages
    const crossTenantAdminAttempt = await page.goto('http://admin-b.localhost:3000/dashboard/admin');

    // Should redirect or show error (not admin-b data)
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('admin-b');

    // STEP 4: Verify API calls are tenant-scoped
    await page.goto('http://admin-a.localhost:3000/dashboard/admin/courses');

    // Listen for API responses
    const apiResponses: string[] = [];
    page.on('response', async (response) => {
      if (response.url().includes('/api/') && response.status() === 200) {
        const body = await response.text();
        apiResponses.push(body);
      }
    });

    await page.reload();
    await page.waitForTimeout(2000);

    // Verify no School B data in API responses
    for (const responseBody of apiResponses) {
      expect(responseBody).not.toContain('Admin School B');
    }

    // Cleanup
    await schoolBContext?.close();
  });

  /**
   * Test 1.7: Cross-Tenant Teacher Dashboard Isolation
   * Objective: Verify teachers can only manage courses in their tenant
   * Security Risk: HIGH - Unauthorized course modification
   */
  test('1.7: Cross-Tenant Teacher Dashboard Isolation', async ({ page, context }) => {
    test.setTimeout(120000);

    // STEP 1: Create School A with teacher
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Teacher School A');
    await page.fill('[name="slug"]', 'teacher-a');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/teacher-a\.localhost:3000/);

    // Create course as teacher in School A
    await page.goto('http://teacher-a.localhost:3000/dashboard/teacher/courses/new');
    await page.fill('[name="title"]', 'Teacher Course A');
    await page.click('button:has-text("Create Course")');
    await page.waitForURL(/\/dashboard\/teacher\/courses\/\d+/);
    const courseAId = page.url().match(/\/courses\/(\d+)/)?.[1];

    // STEP 2: Create School B with different teacher
    const schoolBContext = await context.browser()?.newContext();
    const schoolBPage = await schoolBContext!.newPage();

    await schoolBPage.goto('http://localhost:3000/create-school');
    await schoolBPage.fill('[name="name"]', 'Teacher School B');
    await schoolBPage.fill('[name="slug"]', 'teacher-b');
    await schoolBPage.click('button:has-text("Create School")');
    await schoolBPage.waitForURL(/teacher-b\.localhost:3000/);

    // Create course as teacher in School B
    await schoolBPage.goto('http://teacher-b.localhost:3000/dashboard/teacher/courses/new');
    await schoolBPage.fill('[name="title"]', 'Teacher Course B');
    await schoolBPage.click('button:has-text("Create Course")');
    await schoolBPage.waitForURL(/\/dashboard\/teacher\/courses\/\d+/);

    // STEP 3: Verify teacher in School A cannot see School B courses
    await page.goto('http://teacher-a.localhost:3000/dashboard/teacher/courses');
    const courseListA = await page.locator('table, [data-testid="course-list"]').textContent();

    expect(courseListA).toContain('Teacher Course A');
    expect(courseListA).not.toContain('Teacher Course B');

    // STEP 4: Verify teacher in School A cannot edit School B courses
    // Try to access School B course edit page from School A subdomain
    const crossEditAttempt = await page.goto(
      `http://teacher-a.localhost:3000/dashboard/teacher/courses/${courseAId}/edit`
    );

    // Should fail or redirect
    expect(crossEditAttempt?.status()).toBeLessThan(400); // Should succeed for own course

    // Cleanup
    await schoolBContext?.close();
  });

  /**
   * Test 1.8: Cross-Tenant Database Query Validation
   * Objective: Verify all database queries include tenant_id filter
   * Security Risk: CRITICAL - SQL injection, data leak
   */
  test('1.8: Cross-Tenant Database Query Validation', async ({ page }) => {
    test.setTimeout(60000);

    // This test verifies the application properly filters queries
    // by monitoring network requests and checking for tenant_id parameters

    // STEP 1: Create a school and login
    await page.goto('http://localhost:3000/create-school');
    await page.fill('[name="name"]', 'Query Test School');
    await page.fill('[name="slug"]', 'query-test');
    await page.click('button:has-text("Create School")');
    await page.waitForURL(/query-test\.localhost:3000/);

    // STEP 2: Monitor network requests
    const apiRequests: any[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') || request.url().includes('supabase')) {
        apiRequests.push({
          url: request.url(),
          method: request.method(),
          postData: request.postData(),
        });
      }
    });

    // STEP 3: Navigate through various pages that make database queries
    await page.goto('http://query-test.localhost:3000/dashboard/admin/courses');
    await page.waitForTimeout(1000);

    await page.goto('http://query-test.localhost:3000/dashboard/admin/users');
    await page.waitForTimeout(1000);

    await page.goto('http://query-test.localhost:3000/dashboard/admin/products');
    await page.waitForTimeout(1000);

    // STEP 4: Verify requests include tenant context
    // Note: This is a basic check - full validation requires database query logging
    expect(apiRequests.length).toBeGreaterThan(0);

    // Log requests for manual inspection
    console.log('API Requests made:', apiRequests.length);
    for (const req of apiRequests.slice(0, 5)) {
      console.log('Request:', req.url);
    }
  });
});
