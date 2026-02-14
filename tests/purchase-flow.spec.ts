import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

test.describe('Purchase Flow Tests', () => {
  const testStudent = {
    email: 'student@test.com',
    password: 'password123'
  };

  test.beforeEach(async () => {
    // Clean up any existing enrollments for test student
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const student = users.find(u => u.email === testStudent.email);
    
    if (student) {
      // Delete existing enrollments
      await supabase
        .from('enrollments')
        .delete()
        .eq('user_id', student.id);
      
      // Delete existing transactions
      await supabase
        .from('transactions')
        .delete()
        .eq('user_id', student.id);
      
      // Delete existing payment requests
      await supabase
        .from('payment_requests')
        .delete()
        .eq('user_id', student.id);
    }
  });

  test('should display products page with manual and stripe payment options', async ({ page }) => {
    await page.goto('http://localhost:3000/products');
    
    // Wait for products to load
    await page.waitForSelector('text=Available Products');
    
    // Check for both products
    await expect(page.locator('text=JavaScript Course - Bank Transfer')).toBeVisible();
    await expect(page.locator('text=JavaScript Course - Credit Card')).toBeVisible();
    
    // Check payment methods are displayed
    await expect(page.locator('text=Manual/Offline')).toBeVisible();
    await expect(page.locator('text=stripe')).toBeVisible();
    
    // Check prices
    await expect(page.locator('text=$49.99')).toHaveCount(2);
  });

  test('should display pricing page with database plans', async ({ page }) => {
    await page.goto('http://localhost:3000/pricing');
    
    // Wait for plans to load
    await page.waitForSelector('text=Choose Your Learning Path');
    
    // Check for plans (Basic is hardcoded, Pro Monthly/Yearly from database)
    await expect(page.locator('text=Basic')).toBeVisible();
    await expect(page.locator('text=Pro Monthly')).toBeVisible();
    await expect(page.locator('text=Pro Yearly')).toBeVisible();
    
    // Check prices
    await expect(page.locator('text=$0')).toBeVisible(); // Basic
    await expect(page.locator('text=$19')).toBeVisible(); // Pro Monthly
    await expect(page.locator('text=$190')).toBeVisible(); // Pro Yearly
    
    // Test toggle
    await page.click('[role="switch"]');
    await expect(page.locator('text=$190')).toBeVisible();
  });

  test('should create manual payment request for product', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:3000/auth/login');
    await page.fill('input[type="email"]', testStudent.email);
    await page.fill('input[type="password"]', testStudent.password);
    await page.click('button[type="submit"]');
    
    // Wait for redirect
    await page.waitForURL('**/dashboard/student');
    
    // Go to products page
    await page.goto('http://localhost:3000/products');
    
    // Find and click the manual payment product
    const manualProduct = page.locator('text=JavaScript Course - Bank Transfer').locator('..');
    await manualProduct.locator('text=Request Payment Info').click();
    
    // Wait for dialog
    await page.waitForSelector('text=Request Payment Information');
    
    // Fill out the form
    await page.fill('input[id="name"]', 'John Student');
    await page.fill('input[id="email"]', 'student@test.com');
    await page.fill('input[id="phone"]', '+1234567890');
    await page.fill('textarea[id="message"]', 'Please send payment instructions');
    
    // Submit
    await page.click('button:has-text("Request Payment Info")');
    
    // Wait for success toast
    await page.waitForSelector('text=Payment request sent', { timeout: 5000 });
    
    // Verify in database
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const student = users.find(u => u.email === testStudent.email);
    
    const { data: requests } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('user_id', student!.id)
      .eq('status', 'pending');
    
    expect(requests).toHaveLength(1);
    expect(requests![0].contact_name).toBe('John Student');
  });

  test('should complete checkout flow for plan purchase', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:3000/auth/login');
    await page.fill('input[type="email"]', testStudent.email);
    await page.fill('input[type="password"]', testStudent.password);
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/dashboard/student');
    
    // Go to pricing page
    await page.goto('http://localhost:3000/pricing');
    
    // Click on Pro Monthly "Get Started"
    const proMonthly = page.locator('text=Pro Monthly').locator('..');
    await proMonthly.locator('button:has-text("Get Started")').first().click();
    
    // Should be on checkout page
    await page.waitForURL('**/checkout?planId=*');
    
    // Verify page content
    await expect(page.locator('text=Checkout')).toBeVisible();
    await expect(page.locator('text=Pro Monthly')).toBeVisible();
    await expect(page.locator('text=$19')).toBeVisible();
    
    // Click pay button
    await page.click('button:has-text("Pay & Enroll (Test)")');
    
    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard/student', { timeout: 10000 });
    
    // Verify enrollment and transaction in database
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const student = users.find(u => u.email === testStudent.email);
    
    // Check transaction was created
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', student!.id)
      .eq('status', 'successful');
    
    expect(transactions).toHaveLength(1);
    expect(parseFloat(transactions![0].amount)).toBe(19.00);
    
    // Check subscription was created
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', student!.id)
      .eq('subscription_status', 'active');
    
    expect(subscriptions).toHaveLength(1);
  });

  test('should complete checkout flow for product (course) purchase', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:3000/auth/login');
    await page.fill('input[type="email"]', testStudent.email);
    await page.fill('input[type="password"]', testStudent.password);
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/dashboard/student');
    
    // Get the course ID first
    const { data: courses } = await supabase
      .from('courses')
      .select('course_id')
      .eq('status', 'published')
      .limit(1);
    
    const courseId = courses![0].course_id;
    
    // Go directly to checkout with course ID
    await page.goto(`http://localhost:3000/checkout?courseId=${courseId}`);
    
    // Verify page content
    await expect(page.locator('text=Checkout')).toBeVisible();
    await expect(page.locator('text=Introduction to JavaScript')).toBeVisible();
    
    // Click pay button
    await page.click('button:has-text("Pay & Enroll (Test)")');
    
    // Wait for redirect
    await page.waitForURL('**/dashboard/student', { timeout: 10000 });
    
    // Verify enrollment in database
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const student = users.find(u => u.email === testStudent.email);
    
    // Check transaction
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', student!.id)
      .eq('status', 'successful');
    
    expect(transactions).toHaveLength(1);
    
    // Check enrollment
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('*')
      .eq('user_id', student!.id)
      .eq('course_id', courseId)
      .eq('status', 'active');
    
    expect(enrollments).toHaveLength(1);
  });

  test('should navigate from product detail to manual payment', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:3000/auth/login');
    await page.fill('input[type="email"]', testStudent.email);
    await page.fill('input[type="password"]', testStudent.password);
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/dashboard/student');
    
    // Get manual payment product
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('payment_provider', 'manual')
      .single();
    
    // Go to product detail page
    await page.goto(`http://localhost:3000/products/${products!.product_id}`);
    
    // Verify content
    await expect(page.locator('text=JavaScript Course - Bank Transfer')).toBeVisible();
    await expect(page.locator('text=$49.99')).toBeVisible();
    await expect(page.locator('text=Manual/Offline Payment')).toBeVisible();
    await expect(page.locator('text=How Manual Payment Works')).toBeVisible();
    
    // Click request button
    await page.click('button:has-text("Request Payment Information")');
    
    // Dialog should open
    await page.waitForSelector('text=Request Payment Information');
  });
});
