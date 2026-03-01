import { test, expect } from "@playwright/test";

test("Free course enrollment flow", async ({ page }) => {
  // Navigate to free course (course 3)
  await page.goto("http://localhost:3000/courses/3");
  
  // Check page loaded
  await page.waitForLoadState("networkidle");
  
  // Look for Enroll button
  const enrollButton = page.getByRole("button", { name: /Enroll for Free/i }).first();
  
  if (await enrollButton.isVisible()) {
    console.log("✓ Found 'Enroll for Free' button");
    await enrollButton.click();
    await page.waitForLoadState("networkidle");
  } else {
    console.log("✗ 'Enroll for Free' button not found");
    console.log("URL:", page.url());
  }
});

test("Login and enroll in free course", async ({ page }) => {
  // First login
  await page.goto("http://localhost:3000/auth/login");
  await page.waitForLoadState("networkidle");
  
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  
  await emailInput.fill("student@test.com");
  await passwordInput.fill("password123");
  await page.click('button:has-text("Login")');
  
  // Wait for navigation
  await page.waitForTimeout(3000);
  
  console.log("After login, URL:", page.url());
  
  // Try to navigate to free course
  await page.goto("http://localhost:3000/courses/3");
  await page.waitForLoadState("networkidle");
  
  // Try enrollment
  const enrollButton = page.getByRole("button", { name: /Enroll for Free/i }).first();
  if (await enrollButton.isVisible()) {
    await enrollButton.click();
    await page.waitForLoadState("networkidle");
    console.log("After enrollment, URL:", page.url());
  }
});
