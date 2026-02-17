# Payment Infrastructure Analysis

## Current State ✅

Your LMS already has **multi-payment provider support** built-in! Here's what exists:

### 1. Database Schema (Already Implemented)

#### Products & Plans Tables
```sql
-- Both tables have payment_provider column
ALTER TABLE products ADD COLUMN payment_provider VARCHAR(20) DEFAULT 'stripe';
ALTER TABLE plans ADD COLUMN payment_provider VARCHAR(20) DEFAULT 'stripe';

-- Constraints (currently: stripe, manual, paypal)
CHECK (payment_provider IN ('stripe', 'manual', 'paypal'))
```

#### Transactions Table
- `payment_method` VARCHAR(50) - Flexible string field for any provider
- `status` ENUM - pending, successful, failed, archived, canceled
- Supports both `product_id` and `plan_id`

#### Payment Requests Table (For Manual/Offline Payments)
Comprehensive table with:
- **Contact info:** name, email, phone, message
- **Status workflow:** pending → contacted → payment_received → completed → cancelled
- **Payment details:** method, instructions, deadline, confirmed_at, amount, currency
- **Invoice tracking:** invoice_number, invoice_generated_at
- **Admin tracking:** processed_by, admin_notes
- **RLS policies:** Students can view/create own requests, admins can view/update all

### 2. Migration Files
- `20260207190849_add_payment_provider_to_products.sql` - Adds payment_provider to products/plans
- `20260201160000_create_payment_requests_table.sql` - Manual payment request tracking

### 3. Current Supported Providers
✅ **Stripe** - Fully implemented (create-payment-intent, webhook)
✅ **Manual/Offline** - Database ready, needs UI workflow
⚠️ **PayPal** - Database ready, not yet implemented
❌ **LemonSqueezy** - Not in constraints yet

---

## Required Changes for Multi-Provider Support

### Phase 3A: Add LemonSqueezy Support

#### 1. Update Database Constraints
```sql
-- Migration: add_lemonsqueezy_payment_provider.sql

-- Update products constraint
ALTER TABLE products DROP CONSTRAINT products_payment_provider_check;
ALTER TABLE products ADD CONSTRAINT products_payment_provider_check
CHECK (payment_provider IN ('stripe', 'lemonsqueezy', 'manual', 'paypal'));

-- Update plans constraint
ALTER TABLE plans DROP CONSTRAINT plans_payment_provider_check;
ALTER TABLE plans ADD CONSTRAINT plans_payment_provider_check
CHECK (payment_provider IN ('stripe', 'lemonsqueezy', 'manual', 'paypal'));

-- Add provider-specific metadata columns
ALTER TABLE products ADD COLUMN provider_product_id VARCHAR(255);
ALTER TABLE products ADD COLUMN provider_metadata JSONB;

ALTER TABLE plans ADD COLUMN provider_product_id VARCHAR(255);
ALTER TABLE plans ADD COLUMN provider_metadata JSONB;

-- Add provider reference to transactions
ALTER TABLE transactions ADD COLUMN payment_provider VARCHAR(20);
ALTER TABLE transactions ADD COLUMN provider_transaction_id VARCHAR(255);
ALTER TABLE transactions ADD COLUMN provider_metadata JSONB;
```

#### 2. Create LemonSqueezy Integration
```typescript
// lib/lemonsqueezy/client.ts
import { lemonSqueezySetup } from '@lemonsqueezy/lemonsqueezy.js'

export function getLemonSqueezyClient() {
  return lemonSqueezySetup({
    apiKey: process.env.LEMONSQUEEZY_API_KEY!,
  })
}

// lib/lemonsqueezy/webhook.ts
export async function verifyLemonSqueezyWebhook(
  payload: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET!
  // Verify webhook signature
}
```

#### 3. Update Payment API Routes

**Create Unified Payment Handler:**
```typescript
// app/api/checkout/route.ts
export async function POST(request: Request) {
  const { productId, planId, provider } = await request.json()
  const tenantId = await getCurrentTenantId()

  // Get product/plan with provider info
  const { data: item } = await supabase
    .from(productId ? 'products' : 'plans')
    .select('*, payment_provider, provider_product_id')
    .eq(productId ? 'product_id' : 'plan_id', productId || planId)
    .eq('tenant_id', tenantId)
    .single()

  if (!item) {
    return new Response('Not found', { status: 404 })
  }

  // Route to appropriate provider
  switch (item.payment_provider) {
    case 'stripe':
      return createStripeCheckout(item, tenantId)
    case 'lemonsqueezy':
      return createLemonSqueezyCheckout(item, tenantId)
    case 'manual':
      return createPaymentRequest(item, tenantId)
    default:
      return new Response('Unsupported payment provider', { status: 400 })
  }
}
```

**LemonSqueezy Webhook Handler:**
```typescript
// app/api/lemonsqueezy/webhook/route.ts
import { verifyLemonSqueezyWebhook } from '@/lib/lemonsqueezy/webhook'

export async function POST(request: Request) {
  const payload = await request.text()
  const signature = request.headers.get('x-signature')!

  const isValid = await verifyLemonSqueezyWebhook(payload, signature)
  if (!isValid) {
    return new Response('Invalid signature', { status: 400 })
  }

  const event = JSON.parse(payload)

  switch (event.meta.event_name) {
    case 'order_created':
      // Handle successful payment
      await handleLemonSqueezyPayment(event)
      break
    case 'subscription_created':
      // Handle subscription
      await handleLemonSqueezySubscription(event)
      break
    // ... other events
  }

  return Response.json({ received: true })
}
```

#### 4. Update Stripe Connect for Multi-Provider

**Revenue Split Logic:**
```typescript
// Revenue splits only apply to providers that support it
// Stripe Connect: Use application_fee_amount
// LemonSqueezy: No built-in splits, handle via transfers
// Manual: No splits (direct to school)
```

**Updated Revenue Tables:**
```sql
-- Add provider column to revenue_splits
ALTER TABLE revenue_splits
ADD COLUMN applies_to_providers TEXT[] DEFAULT ARRAY['stripe', 'lemonsqueezy'];

-- PayPal and manual payments might have different split logic
UPDATE revenue_splits
SET applies_to_providers = ARRAY['stripe']
WHERE platform_percentage > 0;
```

---

## Manual Payment Workflow (Already in DB)

### Student Flow
1. Student requests manual payment for a course
2. Fills form: contact_name, contact_email, contact_phone, message
3. Creates `payment_requests` record with status='pending'

### Admin Flow
1. Admin sees pending payment requests in dashboard
2. Admin sends payment instructions (bank transfer details, wire info, etc.)
3. Updates status to 'contacted', fills payment_method, payment_instructions, payment_deadline
4. Student makes offline payment
5. Admin confirms payment received (status='payment_received')
6. Admin enrolls student manually or system auto-enrolls (status='completed')

### Required UI Components
```typescript
// components/student/payment-request-form.tsx
// components/admin/payment-requests-dashboard.tsx
// app/[locale]/dashboard/admin/payment-requests/page.tsx
```

---

## Payment Provider Comparison

| Feature | Stripe | LemonSqueezy | Manual | PayPal |
|---------|--------|--------------|--------|--------|
| **Status** | ✅ Implemented | ❌ Not yet | ⚠️ DB only | ❌ Not yet |
| **Revenue Split** | ✅ Connect | ⚠️ Manual | ❌ N/A | ⚠️ Manual |
| **Webhooks** | ✅ Yes | ✅ Yes | ❌ N/A | ✅ Yes |
| **Subscriptions** | ✅ Yes | ✅ Yes | ⚠️ Manual | ✅ Yes |
| **International** | ✅ 135+ countries | ✅ Global | ✅ Yes | ✅ Yes |
| **Fees** | 2.9% + 30¢ | 5% + 50¢ | ❌ None | 2.9% + 30¢ |
| **Merchant of Record** | ❌ No | ✅ Yes | ❌ N/A | ❌ No |
| **Tax Handling** | Manual | ✅ Automatic | Manual | Manual |
| **Best For** | US/Global | Global + tax | Local/B2B | eBay-style |

---

## Recommended Implementation Order

### Phase 3 (Updated)

**Task #10: Create Revenue Infrastructure** (Updated)
- ✅ Already have: `payment_requests` table
- ✅ Already have: `payment_provider` column on products/plans
- 🔨 Add: LemonSqueezy to constraints
- 🔨 Add: `provider_product_id`, `provider_metadata` columns
- 🔨 Add: Revenue splits with `applies_to_providers` array

**Task #11: Implement Multi-Provider Routing** (Updated from "Stripe Connect only")
- 🔨 Create unified `/api/checkout` endpoint
- 🔨 Route by `payment_provider`:
  - Stripe → Stripe Connect (existing)
  - LemonSqueezy → LemonSqueezy Checkout
  - Manual → Payment Request workflow
  - PayPal → PayPal Checkout (future)

**Task #12: Implement Webhooks** (Updated)
- ✅ Stripe webhook exists
- 🔨 Add `/api/lemonsqueezy/webhook` route
- 🔨 Add webhook verification for LemonSqueezy
- 🔨 Add unified transaction creation logic

**Task #13: School Revenue Dashboard** (Updated)
- Show revenue by provider
- Handle different payout schedules (Stripe: 7 days, LS: 14 days)
- Manual payment tracking

**Task #14: Manual Payment Admin UI** (New)
- `app/[locale]/dashboard/admin/payment-requests/page.tsx`
- View pending requests
- Send payment instructions
- Confirm payments
- Auto-enroll students

**Task #15: Implement Plan Course Limits** (Existing)
- No changes needed

---

## Environment Variables Needed

```bash
# Stripe (existing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# LemonSqueezy (new)
LEMONSQUEEZY_API_KEY=...
LEMONSQUEEZY_WEBHOOK_SECRET=...
LEMONSQUEEZY_STORE_ID=...
NEXT_PUBLIC_LEMONSQUEEZY_STORE_ID=...

# PayPal (future)
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
```

---

## Migration Priorities

### High Priority (Do First)
1. ✅ **Manual Payment UI** - Most schools need this NOW
   - Admin dashboard for payment requests
   - Student payment request form
   - Email notifications for requests

2. 🔨 **LemonSqueezy Integration** - Better for international
   - Add to constraints
   - Webhook handler
   - Checkout flow

### Medium Priority
3. 🔨 **Multi-Provider Checkout Router**
   - Unified `/api/checkout` endpoint
   - Provider-agnostic frontend

### Low Priority
4. ⏳ **PayPal Integration** - Only if specifically requested
5. ⏳ **Cryptocurrency** - Future consideration

---

## Notes for Revenue Model

**Important:** Different providers have different revenue split capabilities:

1. **Stripe Connect** → Application fees work perfectly
2. **LemonSqueezy** → No built-in splits, you'd need to:
   - Track revenue per school
   - Do monthly transfers/payouts manually
   - Or use their API to create affiliate links
3. **Manual Payments** → Goes 100% to school (no platform fee)
4. **PayPal** → Can use PayPal MassPay for splits

**Recommendation:** For multi-provider support with revenue splits:
- Stripe Connect for US/Standard schools (20% platform fee)
- LemonSqueezy for international schools (manual monthly reconciliation)
- Manual payments for enterprise/B2B (0% platform fee)

This gives schools flexibility while maintaining revenue streams.
