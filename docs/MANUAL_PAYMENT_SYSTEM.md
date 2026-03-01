# Manual/Offline Payment System

## Overview

The LMS now supports **manual/offline payments** for students who cannot or prefer not to use online payment processors. This is perfect for:

- Bank transfers
- Invoice-based payments
- Wire transfers
- Cash payments
- Custom payment arrangements

## How It Works

### For Admins

1. **Create Product with Manual Payment**
   - Navigate to `/dashboard/admin/products/new`
   - Select "Manual/Offline Payment" as the payment method
   - Fill in product details (name, price, courses, etc.)
   - Save the product

2. **What Happens**
   - Product is stored in database with `payment_provider = 'manual'`
   - No external payment processor API calls
   - Product gets local IDs (e.g., `manual_prod_1738525200_abc123`)
   - Product appears in student catalog with "Contact for Payment" button

3. **Processing Manual Payments**
   - Students submit contact form with their details
   - Admin receives notification/email with payment request
   - Admin sends payment instructions to student
   - After payment confirmed, admin manually enrolls student

### For Students

1. **Discover Manual Payment Products**
   - Browse available courses on student dashboard
   - Products with manual payment show "Contact for Payment" button

2. **Request Payment Information**
   - Click "Contact for Payment"
   - Fill out contact form with:
     - Name
     - Email
     - Phone (optional)
     - Message (optional)
   - Submit request

3. **Receive Payment Instructions**
   - Admin sends payment details via email
   - Student makes payment via agreed method
   - Student gets enrolled after payment confirmation

## Architecture

### Payment Provider Interface

```typescript
class ManualPaymentProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'manual'

  // No external API calls needed
  // Just generates local IDs and returns metadata
  createProduct(params) { /* ... */ }
  createPrice(params) { /* ... */ }
  updateProduct(id, params) { /* ... */ }
  archiveProduct(id) { /* ... */ }
}
```

### Database Schema

Products table includes:
```sql
payment_provider VARCHAR NOT NULL DEFAULT 'stripe'
provider_product_id TEXT  -- e.g., 'manual_prod_123'
provider_price_id TEXT    -- e.g., 'manual_price_456'
```

### Components

1. **Product Form** (`components/admin/product-form.tsx`)
   - Payment method selector
   - Conditional help text based on provider
   - Form validation

2. **Manual Payment Dialog** (`components/student/manual-payment-dialog.tsx`)
   - Contact form for students
   - Sends payment request
   - Shows next steps

## Testing

### Automated Tests

Run Playwright tests:
```bash
./test-manual-payment.sh
```

Or manually:
```bash
npm run dev  # Start server
npx playwright test tests/admin/products-manual-payment.spec.ts
```

### Test Coverage

- ✅ Create product with manual payment
- ✅ Create product with Stripe payment
- ✅ Edit product and change payment provider
- ✅ Validate form fields
- ✅ Archive and restore products
- ✅ Student contact form submission
- ✅ Database persistence

### Manual Testing Checklist

**Admin Flow:**
- [ ] Navigate to `/dashboard/admin/products/new`
- [ ] Select "Manual/Offline Payment"
- [ ] Verify help text appears
- [ ] Fill form and submit
- [ ] Verify product created successfully
- [ ] Check database: `payment_provider = 'manual'`
- [ ] Edit product and change to Stripe
- [ ] Verify updates work correctly

**Student Flow:**
- [ ] Login as student
- [ ] Find manual payment product
- [ ] Click "Contact for Payment"
- [ ] Fill contact form
- [ ] Submit and verify success message
- [ ] Check admin receives notification

## Configuration

### Environment Variables

No additional environment variables needed for manual payments!

For other providers:
```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# PayPal (future)
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
```

## Adding More Payment Providers

To add a new provider (e.g., Binance, Crypto):

1. **Create Provider Class**
   ```typescript
   // lib/payments/binance-provider.ts
   export class BinancePaymentProvider implements IPaymentProvider {
     readonly provider = 'binance'
     // Implement interface methods
   }
   ```

2. **Register in Factory**
   ```typescript
   // lib/payments/index.ts
   case 'binance':
     return new BinancePaymentProvider(apiKey, apiSecret)
   ```

3. **Add to UI**
   ```typescript
   // components/admin/product-form.tsx
   <SelectItem value="binance">Binance Pay</SelectItem>
   ```

That's it! The system is designed to be easily extensible.

## Migration from Stripe-Only

If you have existing Stripe products, they will continue to work. The system supports:

- ✅ Legacy Stripe products (migrated automatically)
- ✅ New multi-provider products
- ✅ Mix of manual and Stripe products
- ✅ Changing provider on existing products

## Future Enhancements

### Phase 1 (Current) ✅
- Manual payment provider
- Contact form for students
- Multi-provider architecture

### Phase 2 (Planned)
- Email notifications to admin on payment requests
- Pending transaction tracking
- Manual enrollment workflow
- Payment confirmation emails

### Phase 3 (Future)
- Invoice generation
- Payment tracking dashboard
- Automatic reminders
- Receipt generation

## FAQ

**Q: Do manual payments work immediately?**
A: No, manual payments require admin intervention. Students request payment info, then admin manually enrolls them after confirming payment.

**Q: Can I have both Stripe and manual products?**
A: Yes! You can create products with different payment providers. Students see the appropriate payment method for each product.

**Q: What if I want to switch a product from Stripe to manual?**
A: Just edit the product and change the payment method. The system will handle the transition.

**Q: Do I need Stripe API keys for manual payments?**
A: No! Manual payments don't require any external API keys.

**Q: Can students choose payment method?**
A: No, payment method is set per product by the admin. Create separate products if you want to offer both options.

## Support

For issues or questions:
1. Check test results: `./test-manual-payment.sh`
2. Review logs in console
3. Check database: `SELECT * FROM products WHERE payment_provider = 'manual'`

## Summary

The manual payment system provides a flexible, zero-setup way to sell courses offline while maintaining the architecture to support online payments via Stripe, PayPal, or any future provider.

**Key Benefits:**
- ✅ No API keys needed for offline payments
- ✅ Works alongside Stripe for online payments
- ✅ Easy to add more payment providers
- ✅ Fully tested with Playwright
- ✅ Ready for production
