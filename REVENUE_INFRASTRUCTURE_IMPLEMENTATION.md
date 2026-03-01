# Revenue Infrastructure Implementation

**Implementation Date:** 2026-02-16  
**Status:** ✅ Complete & Production Ready  
**Build Status:** ✅ Passing  

---

## Overview

Implemented **Stripe Connect revenue splitting** to enable the multi-tenant SaaS business model. Schools collect payments directly to their Stripe accounts while the platform automatically takes a configurable percentage fee.

**Revenue Model:**
- Platform Fee: Configurable per tenant (default 20%)
- School Revenue: Remainder (default 80%)
- Payment Flow: Student → Platform → School (with automatic split)

---

## 🎯 Features Implemented

### 1. Revenue Infrastructure Tables

**Tables Created:**
- `revenue_splits` - Per-tenant revenue split configuration
- `payouts` - Track school payouts from Stripe
- `invoices` - Student-facing receipts (future use)

### 2. Stripe Connect Integration

**Payment Routing:**
- All payments route through platform Stripe account
- Platform takes application fee (configurable %)
- Remainder automatically transferred to school's connected account
- Schools must connect Stripe account before accepting payments

**Supported Events:**
- `payment_intent.succeeded` - Process successful payments
- `charge.refunded` - Handle refunds, cancel enrollments
- `payout.paid` - Track school payouts
- `payout.failed` - Handle payout failures

### 3. Refund Handling

**Automatic Cancellation:**
- When charge is refunded, transaction marked as `refunded`
- If product purchase: disable all enrollments for that product
- If plan purchase: cancel subscription
- Preserves audit trail

---

## 📁 Files Created/Modified

### New Migration Files (2)

#### 1. `supabase/migrations/[timestamp]_create_revenue_infrastructure.sql`

**Tables:**

```sql
-- Revenue splits per tenant
CREATE TABLE revenue_splits (
  split_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  platform_percentage NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  school_percentage NUMERIC(5,2) NOT NULL DEFAULT 80.00,
  applies_to_providers TEXT[] DEFAULT ARRAY['stripe'],
  CONSTRAINT revenue_split_total CHECK (platform_percentage + school_percentage = 100)
);

-- School payouts tracking
CREATE TABLE payouts (
  payout_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  stripe_payout_id VARCHAR(255) UNIQUE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

-- Student invoices/receipts
CREATE TABLE invoices (
  invoice_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void', 'refunded'))
);
```

**RLS Policies:**
- Schools can view own revenue splits (read-only, updates via admin UI future)
- Schools can view own payouts
- Students can view own invoices
- Admins have full access to tenant data
- Super admins have global access

#### 2. `supabase/migrations/[timestamp]_add_stripe_fields_to_transactions.sql`

**Changes:**
```sql
-- Add tracking for Stripe payment intents (needed for refunds)
ALTER TABLE transactions
ADD COLUMN stripe_payment_intent_id VARCHAR(255);

-- Index for fast webhook lookups
CREATE INDEX idx_transactions_stripe_payment_intent
ON transactions(stripe_payment_intent_id);

-- Add 'refunded' status
ALTER TABLE transactions DROP CONSTRAINT transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
CHECK (status IN ('pending', 'successful', 'failed', 'archived', 'canceled', 'refunded'));
```

---

### Modified API Routes (2)

#### 1. `app/api/stripe/create-payment-intent/route.ts`

**Changes Made:**

**Added Tenant Stripe Account Check:**
```typescript
// Get tenant's Stripe Connect account
const { data: tenant } = await supabase
  .from('tenants')
  .select('stripe_account_id')
  .eq('id', tenantId)
  .single()

if (!tenant?.stripe_account_id) {
  return NextResponse.json({
    error: 'School has not connected their payment account. Please contact school admin to set up payments.'
  }, { status: 400 })
}
```

**Added Revenue Split Calculation:**
```typescript
// Get revenue split configuration
const { data: split } = await supabase
  .from('revenue_splits')
  .select('platform_percentage')
  .eq('tenant_id', tenantId)
  .single()

// Calculate platform fee (default 20%)
const platformPercentage = split?.platform_percentage || 20
const platformFee = Math.round((amount * platformPercentage) / 100)
```

**Updated PaymentIntent Creation:**
```typescript
const paymentIntent = await getStripe().paymentIntents.create({
  amount,
  currency: 'usd',
  customer: stripeCustomerId,
  automatic_payment_methods: { enabled: true },
  application_fee_amount: platformFee,  // ← Platform's cut
  transfer_data: {
    destination: tenant.stripe_account_id,  // ← Money goes to school
  },
  metadata: {
    transactionId: transaction.transaction_id.toString(),
    userId: user.id,
    tenantId: tenantId,
    planId: planId?.toString() || '',
    productId: productId?.toString() || '',
  },
})

// Save payment intent ID for refund tracking
await supabase
  .from('transactions')
  .update({ stripe_payment_intent_id: paymentIntent.id })
  .eq('transaction_id', transaction.transaction_id)
```

**Updated Transaction Record:**
```typescript
const { data: transaction } = await supabase
  .from('transactions')
  .insert({
    user_id: user.id,
    plan_id: planId || null,
    product_id: productId || null,
    amount: amount / 100,
    currency: 'usd',
    status: 'pending',
    payment_provider: 'stripe',  // ← Added
    tenant_id: tenantId,         // ← Added
  })
```

#### 2. `app/api/stripe/webhook/route.ts`

**Added Event Handlers:**

**Charge Refunded:**
```typescript
case 'charge.refunded': {
  const charge = event.data.object as Stripe.Charge
  const paymentIntentId = charge.payment_intent as string

  // Find transaction by payment intent ID
  const { data: transaction } = await getSupabaseAdmin()
    .from('transactions')
    .select('transaction_id, tenant_id, product_id, plan_id, user_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single()

  if (transaction) {
    // Validate tenant
    if (tenantId && transaction.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
    }

    // Mark as refunded
    await getSupabaseAdmin()
      .from('transactions')
      .update({ status: 'refunded' })
      .eq('transaction_id', transaction.transaction_id)

    // Cancel enrollments if product
    if (transaction.product_id) {
      await getSupabaseAdmin()
        .from('enrollments')
        .update({ status: 'disabled' })
        .eq('user_id', transaction.user_id)
        .eq('product_id', transaction.product_id)
    }

    // Cancel subscription if plan
    if (transaction.plan_id) {
      await getSupabaseAdmin()
        .from('subscriptions')
        .update({ subscription_status: 'canceled' })
        .eq('user_id', transaction.user_id)
        .eq('plan_id', transaction.plan_id)
    }
  }
  break
}
```

**Payout Paid:**
```typescript
case 'payout.paid': {
  if (connectedAccountId && tenantId) {
    const payout = event.data.object as Stripe.Payout

    await getSupabaseAdmin()
      .from('payouts')
      .update({
        status: 'paid',
        paid_at: new Date(payout.arrival_date * 1000).toISOString(),
      })
      .eq('stripe_payout_id', payout.id)
      .eq('tenant_id', tenantId)

    console.log(`Payout ${payout.id} marked as paid for tenant ${tenantId}`)
  }
  break
}
```

**Payout Failed:**
```typescript
case 'payout.failed': {
  if (connectedAccountId && tenantId) {
    const payout = event.data.object as Stripe.Payout

    await getSupabaseAdmin()
      .from('payouts')
      .update({ status: 'failed' })
      .eq('stripe_payout_id', payout.id)
      .eq('tenant_id', tenantId)
  }
  break
}
```

---

## 🔄 Payment Flow

### Normal Purchase Flow

```
Student visits checkout page
    ↓
Frontend calls /api/stripe/create-payment-intent
    ↓
API checks:
  1. Tenant has stripe_account_id? (required)
  2. Get revenue split % from revenue_splits table
  3. Calculate platform fee
    ↓
Create PaymentIntent with:
  - application_fee_amount: platform's cut
  - transfer_data.destination: school's account
    ↓
Create transaction record (status: pending)
Save stripe_payment_intent_id
    ↓
Return clientSecret to frontend
    ↓
Student completes payment via Stripe Elements
    ↓
Stripe sends webhook: payment_intent.succeeded
    ↓
Update transaction (status: successful)
Database trigger calls enroll_user() or handle_new_subscription()
    ↓
Student enrolled / subscription activated
```

### Refund Flow

```
Admin initiates refund in Stripe Dashboard
    ↓
Stripe sends webhook: charge.refunded
    ↓
Find transaction by stripe_payment_intent_id
    ↓
Update transaction (status: refunded)
    ↓
If product purchase:
  - Disable enrollments (status: disabled)
If plan purchase:
  - Cancel subscription (status: canceled)
    ↓
Student loses access
```

### Payout Flow

```
Stripe processes payout to school (daily/weekly)
    ↓
Stripe sends webhook: payout.paid
    ↓
Update payouts table (status: paid, paid_at: timestamp)
    ↓
School sees payout in revenue dashboard
```

---

## 🔒 Security Implementation

### Multi-Layer Validation

**Layer 1: Tenant Stripe Account Check**
- Before creating PaymentIntent, verify `stripe_account_id` exists
- Prevents payments to schools that haven't onboarded
- Returns clear error: "School has not connected their payment account"

**Layer 2: Webhook Tenant Validation**
- For Connect events, resolve `event.account` to `tenant_id`
- Validate transaction belongs to detected tenant
- Prevents cross-tenant payment manipulation

**Layer 3: Refund Protection**
- Verify transaction exists before processing refund
- Validate tenant ownership
- Only cancel enrollments/subscriptions for verified transactions

### Revenue Split Security

**Read-Only for Schools:**
- Schools can query their revenue split via RLS
- Cannot modify split % (must be done by super admin)
- Prevents schools from changing their fee percentage

**Default Configuration:**
- All tenants get 20/80 split by default
- Can be customized per tenant
- Applies only to 'stripe' provider (manual payments have no fee)

---

## 💰 Monetization Strategy

### Revenue Split Configuration

**Default Split (80/20):**
- School receives: 80%
- Platform receives: 20%

**Customizable Per Tenant:**
```sql
-- Example: Give enterprise customer better rate
UPDATE revenue_splits
SET platform_percentage = 10.00,
    school_percentage = 90.00
WHERE tenant_id = 'enterprise-school-uuid';
```

**Provider-Specific Splits:**
```sql
-- Revenue split only applies to Stripe
-- Manual payments: 100% to school (no platform fee)
-- Future LemonSqueezy: May have different split
```

### Recommended Pricing Tiers

**Stripe Connect Fee Structure:**

| School Plan | Platform Fee | School Gets | Best For |
|-------------|--------------|-------------|----------|
| Free | 20% | 80% | Trial/evaluation |
| Basic | 20% | 80% | Small schools |
| Professional | 15% | 85% | Medium schools |
| Enterprise | 10% | 90% | Large organizations |

**Alternative: Flat Subscription + Lower Fees:**
- Free plan: 20% fee, $0/month
- Basic plan: 15% fee, $99/month
- Pro plan: 10% fee, $299/month
- Enterprise: 5% fee, custom/month

---

## 🧪 Testing Guide

### Manual Testing

#### Test 1: Normal Payment Flow
```bash
# As student
1. Visit /checkout?productId=1
2. Complete Stripe test payment (card: 4242 4242 4242 4242)
3. Verify transaction created with status='successful'
4. Verify enrollment created
5. Check Stripe Dashboard → See application fee deducted
6. Check school's connected account → See transfer
```

#### Test 2: Missing Stripe Account
```bash
# Remove school's stripe_account_id
UPDATE tenants SET stripe_account_id = NULL WHERE id = 'tenant-uuid';

# Try to checkout
1. Visit /checkout?productId=1
2. Should see error: "School has not connected their payment account"
```

#### Test 3: Refund Handling
```bash
# As super admin in Stripe Dashboard
1. Find successful payment
2. Issue full refund
3. Check webhook logs: charge.refunded received
4. Verify transaction status = 'refunded'
5. Verify enrollment status = 'disabled'
6. Verify student cannot access course
```

#### Test 4: Custom Revenue Split
```bash
# Update split for tenant
UPDATE revenue_splits
SET platform_percentage = 30.00,
    school_percentage = 70.00
WHERE tenant_id = 'tenant-uuid';

# Make purchase
1. Complete payment for $100 product
2. Check Stripe: Platform fee should be $30
3. Check connected account: Transfer should be $70
```

### SQL Test Queries

```sql
-- Check revenue splits
SELECT 
  t.name,
  rs.platform_percentage,
  rs.school_percentage,
  rs.applies_to_providers
FROM tenants t
JOIN revenue_splits rs ON rs.tenant_id = t.id;

-- Check transactions with Stripe payment intents
SELECT 
  transaction_id,
  amount,
  status,
  stripe_payment_intent_id,
  payment_provider,
  created_at
FROM transactions
WHERE payment_provider = 'stripe'
ORDER BY created_at DESC
LIMIT 10;

-- Check refunded transactions and canceled enrollments
SELECT 
  t.transaction_id,
  t.amount,
  t.status,
  e.status as enrollment_status,
  u.email
FROM transactions t
LEFT JOIN enrollments e ON e.product_id = t.product_id AND e.user_id = t.user_id
LEFT JOIN auth.users u ON u.id = t.user_id
WHERE t.status = 'refunded';

-- Check payout history
SELECT 
  t.name as school,
  p.amount,
  p.status,
  p.stripe_payout_id,
  p.period_start,
  p.period_end,
  p.paid_at
FROM payouts p
JOIN tenants t ON t.id = p.tenant_id
ORDER BY p.created_at DESC;
```

---

## 📊 Future Enhancements

### Phase 1 (Next Steps)
1. **Revenue Dashboard for Schools** (Task #13)
   - Show total revenue, platform fee, net revenue
   - Display payout history
   - Export reports

2. **Onboarding Wizard Integration** (Task #15)
   - Add Stripe Connect step to school setup
   - Guide through account creation
   - Verify account before allowing paid courses

3. **Payout Notifications**
   - Email school admin when payout arrives
   - Alert if payout fails
   - Monthly revenue summary

### Phase 2 (Advanced Features)
1. **Invoicing System**
   - Auto-generate invoices for students
   - PDF generation
   - Tax calculation (VAT, sales tax)

2. **Multi-Provider Support**
   - LemonSqueezy (Merchant of Record)
   - PayPal (different split logic)
   - Manual payments (no fee)

3. **Advanced Revenue Splits**
   - Tiered splits based on volume
   - Promotional periods (0% platform fee)
   - Referral bonuses

4. **Analytics**
   - Revenue trends
   - Average transaction value
   - Refund rate monitoring
   - Payout reconciliation

---

## 🚨 Important Notes

### Stripe Connect Requirements

**Before Production:**
1. Create Stripe Connect application
2. Set up OAuth redirect URLs
3. Configure webhook endpoints:
   - `https://yourdomain.com/api/stripe/webhook`
   - Enable events: payment_intent.*, charge.refunded, payout.*
4. Test with Stripe test mode
5. Switch to live mode

**Environment Variables:**
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Database Migration

**IMPORTANT:** Run migrations in order:
```bash
# 1. Create revenue infrastructure
supabase migration up 20260216212440_create_revenue_infrastructure.sql

# 2. Add Stripe fields to transactions
supabase migration up 20260217012734_add_stripe_fields_to_transactions.sql

# 3. Seed default revenue splits for existing tenants
INSERT INTO revenue_splits (tenant_id, platform_percentage, school_percentage)
SELECT id, 20.00, 80.00 FROM tenants
ON CONFLICT DO NOTHING;
```

### Webhook Security

**Verify All Webhooks:**
- Signature verification is mandatory
- Use `stripe.webhooks.constructEvent()`
- Never trust webhook data without verification
- Log all webhook events for audit

**Tenant Validation:**
- For Connect events, always resolve tenant from `event.account`
- Validate transaction belongs to tenant before updating
- Prevent cross-tenant data manipulation

---

## 📝 Summary

### What Was Accomplished

✅ Revenue infrastructure tables (splits, payouts, invoices)  
✅ Stripe Connect payment routing with automatic fee deduction  
✅ Platform fee calculation from revenue_splits table  
✅ Refund handling with automatic enrollment cancellation  
✅ Payout tracking (paid/failed status)  
✅ Webhook handlers for all critical events  
✅ Security validation at multiple layers  
✅ Audit trail via stripe_payment_intent_id  

### Files Created/Modified

**New:**
- `supabase/migrations/[timestamp]_create_revenue_infrastructure.sql`
- `supabase/migrations/[timestamp]_add_stripe_fields_to_transactions.sql`

**Modified:**
- `app/api/stripe/create-payment-intent/route.ts` (Stripe Connect routing)
- `app/api/stripe/webhook/route.ts` (Refund + payout handling)

### Build Status

✅ TypeScript: No errors  
✅ ESLint: No errors  
✅ Build: Successful  
✅ Production Ready: Yes (pending Stripe Connect OAuth setup)  

---

**Last Updated:** 2026-02-16  
**Implemented By:** Claude Code  
**Status:** ✅ Complete - Ready for Task #13 (Revenue Dashboard)

---

## Task #13: Revenue Dashboard Implementation

**Completed:** 2026-02-16

### Overview

Created a comprehensive revenue dashboard for schools to monitor their earnings, platform fees, and payout history. The dashboard provides real-time visibility into revenue performance and Stripe payout status.

### Files Created (4)

#### 1. `app/[locale]/dashboard/teacher/revenue/page.tsx`
**Purpose:** Main revenue dashboard page

**Features:**
- Revenue summary cards (total, school share, last 30 days, pending payout)
- Revenue split breakdown (platform fee vs school revenue)
- Stripe Connect account connection status
- Tabbed interface (Transactions, Payouts, Chart)
- Role-based access control (teacher/admin only)

**Key Metrics Displayed:**
```typescript
// Total Revenue
const totalRevenue = sum of all successful transactions

// School's Share (after platform fee)
const platformFee = totalRevenue * (platformPercentage / 100)
const schoolRevenue = totalRevenue - platformFee

// Recent Activity (last 30 days)
const recentRevenue = transactions filtered by last 30 days

// Pending Payout
const pendingPayout = payouts.find(p => p.status === 'pending')?.amount
```

**Stripe Connect Alert:**
- Shows warning card if `stripe_account_id` is NULL
- Provides "Connect Stripe Account" button linking to `/api/stripe/connect`
- Prevents confusion about missing payments

#### 2. `components/teacher/transaction-list.tsx`
**Purpose:** Display all successful transactions

**Features:**
- Table view with date, amount, provider, status
- Badge styling for transaction status
- Empty state with helpful message
- Sorted by date (most recent first)
- Supports filtering by payment provider (stripe, manual, etc.)

**UI Pattern:**
```
┌─────────────────────────────────────────────────┐
│  Recent Transactions                            │
├─────────────────────────────────────────────────┤
│  Date          Amount    Provider    Status     │
│  Feb 16, 2:30  $100.00   stripe      successful │
│  Feb 15, 10:15 $50.00    manual      successful │
└─────────────────────────────────────────────────┘
```

#### 3. `components/teacher/payout-history.tsx`
**Purpose:** Display Stripe Connect payout history

**Features:**
- Shows period start/end dates
- Payout amount and currency
- Status badges (pending, processing, paid, failed)
- Paid date
- Clickable Stripe payout ID (links to Stripe Dashboard)
- Empty state explaining payout schedule

**Payout Statuses:**
- `pending` - Awaiting Stripe processing
- `processing` - In progress
- `paid` - Successfully transferred to bank
- `failed` - Transfer failed (needs attention)

**UI Pattern:**
```
┌───────────────────────────────────────────────────────┐
│  Payout History                                       │
├───────────────────────────────────────────────────────┤
│  Period              Amount    Status    Paid Date    │
│  Feb 1 - Feb 15     $400.00    paid      Feb 16, 2026 │
│  Jan 16 - Jan 31    $350.00    paid      Feb 1, 2026  │
│  Feb 16 - Feb 28    $120.00    pending   —            │
└───────────────────────────────────────────────────────┘
```

#### 4. `components/teacher/revenue-chart.tsx`
**Purpose:** Visualize monthly revenue trends

**Features:**
- Bar chart showing last 12 months
- Horizontal bars with gradient fill
- Shows actual amounts and percentages
- Total and average calculations
- Empty state for new schools

**Data Processing:**
```typescript
// Group by month
const monthlyRevenue = transactions.reduce((grouped, t) => {
  const month = formatYearMonth(t.created_at)
  grouped[month] = (grouped[month] || 0) + parseFloat(t.amount)
  return grouped
}, {})

// Calculate totals
const total = sum(monthlyRevenue.values)
const average = total / monthlyRevenue.length
```

### Navigation Update

**Modified:** `components/app-sidebar.tsx`

**Added Business Section for Teachers:**
```typescript
teacher: {
  main: [...],
  content: [...],
  business: [  // ← NEW
    { title: 'Revenue', href: '/dashboard/teacher/revenue', icon: IconCurrencyDollar }
  ]
}
```

**Sidebar Structure:**
```
Teacher Navigation
├─ Main
│  └─ Dashboard
├─ Content Management
│  ├─ My Courses
│  └─ Create Course
└─ Business              ← NEW SECTION
   └─ Revenue            ← NEW LINK
```

### Translation Updates

**Modified Files:**
- `messages/en.json` - Added "business" and "revenue"
- `messages/es.json` - Added "business" (Negocio) and "revenue" (Ingresos)

**Added Keys:**
```json
{
  "sidebar": {
    "business": "Business",
    "revenue": "Revenue"
  }
}
```

### Access Control

**Security:**
```typescript
const role = await getUserRole()

if (role !== 'teacher' && role !== 'admin') {
  redirect('/dashboard/student')  // Students cannot access
}
```

**Permissions:**
- ✅ Teachers can view revenue for their tenant
- ✅ Admins can view revenue for their tenant
- ❌ Students cannot access revenue dashboard
- ❌ Cross-tenant access prevented (getCurrentTenantId() isolation)

### Use Cases

**1. School Admin Checking Revenue:**
```
1. Navigate to Revenue from sidebar
2. See total revenue: $5,420.00
3. See school's share (80%): $4,336.00
4. Check pending payout: $320.00
5. View transaction history in table
6. Export monthly trend chart
```

**2. New School Without Stripe Connected:**
```
1. Navigate to Revenue
2. See warning: "Payment Account Not Connected"
3. Click "Connect Stripe Account"
4. Complete Stripe onboarding
5. Return to dashboard → warning gone
6. Can now accept payments
```

**3. Reviewing Monthly Performance:**
```
1. Navigate to Revenue → Chart tab
2. See monthly breakdown:
   - January: $1,200
   - February: $1,800 (↑ 50% growth)
   - Average: $1,500/month
3. Identify growth trends
4. Plan marketing strategy
```

**4. Reconciling Payouts:**
```
1. Navigate to Revenue → Payouts tab
2. See list of all payouts
3. Check Feb 1-15 payout: Status = Paid
4. Click Stripe ID → Opens Stripe Dashboard
5. Verify bank deposit matches payout amount
```

### Future Enhancements (Not Implemented Yet)

**Phase 1:**
- Export transactions to CSV
- Date range filters
- Revenue forecasting
- Email notifications for payouts

**Phase 2:**
- Revenue by course (which courses generate most revenue)
- Revenue by student (LTV analysis)
- Refund tracking and analytics
- Tax report generation

**Phase 3:**
- Integration with accounting software (QuickBooks, Xero)
- Multi-currency support
- Automated invoicing
- Revenue sharing with instructors (marketplace model)

### Testing Checklist

- [x] Revenue dashboard accessible by teachers
- [x] Revenue dashboard accessible by admins
- [x] Students redirected away from revenue page
- [x] Metrics calculate correctly (total, school share, platform fee)
- [x] Stripe Connect warning shows when account not connected
- [x] Transaction list displays successful transactions
- [x] Payout history displays correctly
- [x] Revenue chart renders monthly trends
- [x] Empty states display for new schools
- [x] Translations work (EN + ES)
- [x] Navigation link appears in sidebar for teachers
- [x] Build passes without errors

### Summary

**Created:**
- 1 new page (`revenue/page.tsx`)
- 3 new components (transaction-list, payout-history, revenue-chart)
- 1 sidebar section (Business)
- 2 translation keys (business, revenue)

**Result:**
- Teachers can now monitor school revenue in real-time
- Clear visibility into platform fees and school earnings
- Payout tracking integrated with Stripe Connect
- Monthly trend visualization
- Professional, data-driven dashboard

**Build Status:** ✅ Passing (no TypeScript errors)

---

**Implementation Complete:** 2026-02-16  
**Tasks Completed:** 20 of 25 (80%)  
**Next:** Task #15 (Add payment setup to onboarding) or Task #16 (Join school flow)
