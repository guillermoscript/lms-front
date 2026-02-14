# Platform Settings - User Guide

**Admin Feature**  
**Location:** `/dashboard/admin/settings`  
**Access:** Admin role required

---

## Overview

The Platform Settings page allows administrators to configure core system settings across four categories:
- **General** - Site information and global settings
- **Email** - SMTP and email notification configuration
- **Payment** - Payment processor and transaction settings
- **Enrollment** - Course enrollment rules and policies

All settings are stored in the `system_settings` database table and can be updated in real-time.

---

## Accessing Settings

1. Log in as an admin user
2. Navigate to Admin Dashboard (`/dashboard/admin`)
3. Click "Settings" in the Quick Actions section
4. Or visit directly: `/dashboard/admin/settings`

---

## General Settings

### Site Name
**Setting Key:** `site_name`  
**Type:** Text  
**Default:** "LMS V2"

The name of your platform displayed across the site (header, emails, etc.)

**Example:** "Acme Learning Academy"

### Site Description
**Setting Key:** `site_description`  
**Type:** Text  
**Default:** "A modern learning management system"

Brief description used for SEO meta tags and about pages.

**Example:** "Professional development courses for tech leaders"

### Contact Email
**Setting Key:** `contact_email`  
**Type:** Email  
**Default:** "contact@example.com"

Main contact email displayed in footer and contact pages.

### Support Email
**Setting Key:** `support_email`  
**Type:** Email  
**Default:** "support@example.com"

Email address for user support inquiries.

### Timezone
**Setting Key:** `timezone`  
**Type:** Text (IANA timezone)  
**Default:** "America/New_York"

Default timezone for the platform. Uses IANA timezone identifiers.

**Examples:**
- `America/New_York`
- `Europe/London`
- `Asia/Tokyo`
- `Australia/Sydney`

**Find your timezone:** https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

### Maintenance Mode
**Setting Key:** `maintenance_mode`  
**Type:** Object `{ enabled: boolean, message: string }`  
**Default:** `{ enabled: false, message: "" }`

Enable to show a maintenance page to users. Admins can still access the site.

**Maintenance Message:** Custom message displayed to users during maintenance.

---

## Email Settings

### Email Notifications
**Setting Key:** `email_notifications`  
**Type:** Object `{ enabled: boolean }`  
**Default:** `{ enabled: true }`

Master switch for all email notifications. When disabled, no emails are sent.

### SMTP Configuration

#### SMTP Host
**Setting Key:** `smtp_host`  
**Type:** Text  
**Default:** "" (empty)

Your email provider's SMTP server address.

**Examples:**
- Gmail: `smtp.gmail.com`
- Outlook: `smtp.office365.com`
- SendGrid: `smtp.sendgrid.net`
- Mailgun: `smtp.mailgun.org`

#### SMTP Port
**Setting Key:** `smtp_port`  
**Type:** Number  
**Default:** 587

SMTP server port number.

**Common Ports:**
- `587` - TLS (recommended)
- `465` - SSL
- `25` - Unencrypted (not recommended)

#### SMTP Username
**Setting Key:** `smtp_username`  
**Type:** Text  
**Default:** "" (empty)

SMTP authentication username, usually your email address or account username.

#### SMTP Password
**Setting Key:** `smtp_password`  
**Type:** Text (sensitive)  
**Default:** "" (empty)

SMTP authentication password or app-specific password.

**Note:** For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833), not your regular password.

#### SMTP From Email
**Setting Key:** `smtp_from_email`  
**Type:** Email  
**Default:** "noreply@example.com"

Email address used as the sender for outgoing emails.

#### SMTP From Name
**Setting Key:** `smtp_from_name`  
**Type:** Text  
**Default:** "LMS V2"

Display name shown as the sender in email clients.

**Example:** "Acme Learning Academy"

---

## Payment Settings

### Payment Processors

#### Stripe Enabled
**Setting Key:** `stripe_enabled`  
**Type:** Object `{ enabled: boolean }`  
**Default:** `{ enabled: true }`

Enable Stripe payment processing. Requires Stripe API keys in environment variables.

#### PayPal Enabled
**Setting Key:** `paypal_enabled`  
**Type:** Object `{ enabled: boolean }`  
**Default:** `{ enabled: false }`

Enable PayPal payment processing. (Feature not yet implemented)

### Transaction Settings

#### Currency
**Setting Key:** `currency`  
**Type:** Text (ISO 4217)  
**Default:** "USD"

Default currency for all transactions.

**Available Currencies:**
- USD - US Dollar
- EUR - Euro
- GBP - British Pound
- CAD - Canadian Dollar
- AUD - Australian Dollar
- JPY - Japanese Yen
- INR - Indian Rupee
- MXN - Mexican Peso

#### Tax Rate
**Setting Key:** `tax_rate`  
**Type:** Number (percentage)  
**Default:** 0

Default tax rate percentage applied to transactions.

**Example:** Enter `8.5` for 8.5% tax rate. Enter `0` for no tax.

### Invoice Settings

#### Invoice Prefix
**Setting Key:** `invoice_prefix`  
**Type:** Text  
**Default:** "INV"

Prefix for invoice numbers.

**Example:** "INV" generates invoices like INV-001, INV-002, etc.

#### Require Payment Approval
**Setting Key:** `require_payment_approval`  
**Type:** Object `{ enabled: boolean }`  
**Default:** `{ enabled: false }`

When enabled, payments require admin approval before processing.

---

## Enrollment Settings

### Auto Enrollment
**Setting Key:** `auto_enrollment`  
**Type:** Object `{ enabled: boolean }`  
**Default:** `{ enabled: false }`

Automatically enroll new users in designated courses upon registration.

**Note:** Configure which courses in the course settings.

### Allow Self Enrollment
**Setting Key:** `allow_self_enrollment`  
**Type:** Object `{ enabled: boolean }`  
**Default:** `{ enabled: true }`

Allow students to enroll themselves in courses without admin intervention.

When disabled, all enrollments require manual admin approval.

### Require Enrollment Approval
**Setting Key:** `require_enrollment_approval`  
**Type:** Object `{ enabled: boolean }`  
**Default:** `{ enabled: false }`

Require admin approval before students can access enrolled courses.

### Maximum Enrollments Per User
**Setting Key:** `max_enrollments_per_user`  
**Type:** Number  
**Default:** 0

Maximum number of courses a user can enroll in.

**Example:** Set to `5` to limit users to 5 courses. Set to `0` for unlimited.

### Enrollment Expiration Days
**Setting Key:** `enrollment_expiration_days`  
**Type:** Number  
**Default:** 365

Number of days until enrollment expires and user loses access.

**Example:** `365` = 1 year, `180` = 6 months. Set to `0` for never expires.

### Course Capacity Enabled
**Setting Key:** `course_capacity_enabled`  
**Type:** Object `{ enabled: boolean }`  
**Default:** `{ enabled: false }`

Allow setting maximum student limits for individual courses.

When enabled, courses can specify a capacity limit in course settings.

---

## Using Settings in Your Code

### Fetch Settings (Server Component)

```typescript
import { getSettings } from '@/app/actions/admin/settings'

// Get all settings in a category
const result = await getSettings('general')
if (result.success && result.data) {
  const siteName = result.data.site_name.value
  console.log(siteName) // "LMS V2"
}

// Get all settings grouped by category
const result = await getAllSettingsByCategory()
if (result.success && result.data) {
  const emailSettings = result.data.email
  const smtpHost = emailSettings.smtp_host.value.value
}
```

### Fetch Single Setting

```typescript
import { getSetting } from '@/app/actions/admin/settings'

const result = await getSetting('site_name')
if (result.success && result.data) {
  const siteName = result.data.value
}
```

### Update Setting

```typescript
import { updateSetting } from '@/app/actions/admin/settings'

const result = await updateSetting('site_name', { value: 'New Name' })
if (result.success) {
  console.log('Setting updated!')
}
```

### Update Multiple Settings

```typescript
import { updateSettings } from '@/app/actions/admin/settings'

const result = await updateSettings({
  site_name: { value: 'New Name' },
  contact_email: { value: 'new@example.com' }
})
```

### Reset to Default

```typescript
import { resetSetting } from '@/app/actions/admin/settings'

const result = await resetSetting('site_name')
// Resets to "LMS V2"
```

---

## Best Practices

### Email Configuration
1. **Use a dedicated email service** like SendGrid, Mailgun, or AWS SES for reliability
2. **Enable email notifications** only after testing SMTP configuration
3. **Use app-specific passwords** for Gmail/Outlook instead of account passwords
4. **Test email delivery** after configuration changes

### Payment Configuration
1. **Start with test mode** in Stripe before going live
2. **Set appropriate tax rates** for your jurisdiction
3. **Configure webhook endpoints** in Stripe dashboard
4. **Monitor payment approval queue** if enabled

### Enrollment Configuration
1. **Consider your business model** when setting enrollment policies
2. **Test approval workflows** before enabling them
3. **Set reasonable capacity limits** to avoid overbooking
4. **Communicate policies** clearly to students

### Maintenance Mode
1. **Announce maintenance** ahead of time via notifications
2. **Set a clear message** with expected duration
3. **Disable during business hours** if possible
4. **Test the message** before enabling

---

## Troubleshooting

### Settings Not Saving
- **Check admin role:** Only admins can modify settings
- **Check database connection:** Ensure Supabase is accessible
- **Check browser console:** Look for JavaScript errors
- **Check RLS policies:** Ensure admin policies are in place

### Email Not Sending
- **Verify SMTP credentials:** Incorrect username/password
- **Check SMTP port:** Use 587 for TLS, 465 for SSL
- **Check firewall:** Ensure outbound SMTP traffic is allowed
- **Enable email notifications:** Master switch must be on
- **Test with telnet:** `telnet smtp.example.com 587`

### Settings UI Not Loading
- **Check database migration:** Ensure `system_settings` table exists
- **Check default data:** Default settings should be seeded
- **Check server logs:** Look for errors in Next.js console
- **Clear browser cache:** Force reload with Cmd+Shift+R

---

## Security Considerations

### Password Storage
- SMTP passwords are stored in JSONB as plain text
- **For production:** Consider implementing encryption at rest
- **Alternative:** Store SMTP credentials in environment variables

### Access Control
- Only users with 'admin' role can access settings
- All settings operations require admin verification
- RLS policies enforce database-level security

### Sensitive Settings
- SMTP password field has visibility toggle
- Consider masking sensitive values in logs
- Audit all settings changes

---

## FAQs

**Q: Can teachers access settings?**  
A: No, only users with the 'admin' role can view and modify settings.

**Q: Are settings cached?**  
A: Settings are fetched from the database on each page load. Consider implementing caching for production.

**Q: How do I backup settings?**  
A: Settings are stored in the `system_settings` table. Include this table in your database backups.

**Q: Can I add custom settings?**  
A: Yes, insert new rows into `system_settings` with a unique `setting_key` and appropriate category.

**Q: What happens if I break something?**  
A: Use the reset functionality to restore default values, or restore from database backup.

**Q: How do I test email settings?**  
A: Implement a "Send Test Email" button (feature not yet implemented).

---

## Related Documentation

- [Admin Dashboard Progress Report](./ADMIN_DASHBOARD_PROGRESS.md)
- [Database Schema](./DATABASE_SCHEMA.md)
- [Project Overview](./PROJECT_OVERVIEW.md)

---

**Last Updated:** February 14, 2026  
**Version:** 1.0
