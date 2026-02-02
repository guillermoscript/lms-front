# Testing Guide - Multi-Provider Payment System

## Quick Start

### Run All Tests (Automated)

```bash
./test-manual-payment.sh
```

This script will:
1. Start the dev server
2. Run all Playwright tests
3. Stop the server
4. Show results

### Run Tests Manually

1. **Start Dev Server**
   ```bash
   npm run dev
   ```

2. **In Another Terminal, Run Tests**
   ```bash
   # Run all product tests
   npx playwright test tests/admin/products-manual-payment.spec.ts

   # Run with UI
   npx playwright test tests/admin/products-manual-payment.spec.ts --ui

   # Run specific test
   npx playwright test -g "should create a product with manual payment"

   # Run in headed mode (see browser)
   npx playwright test tests/admin/products-manual-payment.spec.ts --headed
   ```

## Test Coverage

### Admin Product Management
- ✅ Create product with manual payment
- ✅ Create product with Stripe payment
- ✅ Edit product and change payment provider
- ✅ Validate required fields
- ✅ Validate price > 0
- ✅ Validate at least one course selected
- ✅ Archive and restore products
- ✅ Database persistence

### Student Payment Flow
- ✅ Show contact form for manual products
- ✅ Show instant purchase for Stripe products
- ✅ Submit payment request successfully

## Manual Testing

### Test 1: Create Manual Payment Product

1. Login as admin (`admin@example.com` / `admin123`)
2. Navigate to `/dashboard/admin/products/new`
3. Fill form:
   - Name: "Test Course Bundle"
   - Description: "Test description"
   - Payment Method: "Manual/Offline Payment"
   - Price: 99.99
   - Currency: USD
   - Select at least one course
4. Click "Create Product"
5. Verify success message
6. Check product appears in list

**Expected Database State:**
```sql
SELECT payment_provider, provider_product_id, provider_price_id
FROM products
WHERE name = 'Test Course Bundle';

-- Should show:
-- payment_provider: 'manual'
-- provider_product_id: 'manual_prod_...'
-- provider_price_id: 'manual_price_...'
```

### Test 2: Create Stripe Payment Product

1. Same steps as Test 1, but select "Stripe (Credit Card, Online)"
2. Submit form
3. Verify Stripe product created (check Stripe dashboard)
4. Check database shows `payment_provider = 'stripe'`

### Test 3: Student Contact Flow

1. Login as student (`student@example.com` / `student123`)
2. Navigate to student dashboard
3. Find a manual payment product
4. Click "Contact for Payment"
5. Fill contact form
6. Submit and verify success message

### Test 4: Edit and Change Provider

1. Login as admin
2. Go to products list
3. Edit an existing product
4. Change payment method from Stripe to Manual (or vice versa)
5. Save
6. Verify updated in database

## Database Verification

### Check Products Table
```sql
-- See all products with payment providers
SELECT
  product_id,
  name,
  payment_provider,
  provider_product_id,
  status
FROM products
ORDER BY created_at DESC;
```

### Check Specific Provider Products
```sql
-- Manual payment products
SELECT * FROM products WHERE payment_provider = 'manual';

-- Stripe products
SELECT * FROM products WHERE payment_provider = 'stripe';
```

## Troubleshooting

### Tests Fail with "Connection Refused"
**Cause:** Dev server not running
**Fix:** Start dev server: `npm run dev`

### Tests Fail with "Admin Login Failed"
**Cause:** Admin user doesn't exist in database
**Fix:** Run migration to ensure admin user exists

### Product Creation Fails
**Cause:** No courses in database
**Fix:** Create at least one course first via teacher dashboard

### Stripe Tests Fail
**Cause:** Missing Stripe API keys
**Fix:** Add to `.env.local`:
```bash
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## Performance Testing

### Load Test (Manual)

Create 100 products with manual payment:
```bash
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/admin/products \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"Product $i\",
      \"price\": 99.99,
      \"paymentProvider\": \"manual\",
      \"courseIds\": [1]
    }"
done
```

Verify all created:
```sql
SELECT COUNT(*) FROM products WHERE payment_provider = 'manual';
```

## CI/CD Integration

### GitHub Actions (Example)

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx playwright install
      - run: ./test-manual-payment.sh
```

## Test Data Requirements

### Minimum Database State

For tests to pass, you need:
- ✅ Admin user (`admin@example.com`)
- ✅ Student user (`student@example.com`)
- ✅ At least 1 course in database
- ✅ Database migrations applied

### Setup Test Data

```sql
-- Check if admin exists
SELECT * FROM profiles WHERE email = 'admin@example.com';

-- Check if student exists
SELECT * FROM profiles WHERE email = 'student@example.com';

-- Check courses
SELECT COUNT(*) FROM courses;
```

## Success Criteria

All tests pass when:
- ✅ Products can be created with manual payment
- ✅ Products can be created with Stripe payment
- ✅ Payment provider can be changed on edit
- ✅ Form validation works correctly
- ✅ Database stores correct provider information
- ✅ Students can submit payment requests
- ✅ No TypeScript errors
- ✅ No console errors in browser

## Next Steps

After tests pass:
1. Deploy to staging environment
2. Test with real Stripe keys
3. Set up admin notifications for payment requests
4. Create admin dashboard for pending payments
5. Implement manual enrollment workflow
