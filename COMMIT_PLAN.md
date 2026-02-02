# Git Commit Plan - LMS V2 Rebuild

This document outlines the semantic commits to be made for all changes in the v2-rebuild branch.

---

## Commit Strategy

Changes will be organized into **12 semantic commits** following conventional commit format:
```
<type>(<scope>): <subject>

<body>

<footer>
```

---

## Commit 1: fix(auth): decode JWT claims for role extraction

**Type**: fix
**Scope**: auth
**Why**: Critical bug fix - admin role was not being recognized

**Files**:
- `lib/supabase/get-user-role.ts`

**Changes**:
- Changed from reading `app_metadata` to decoding JWT access token
- Access token contains custom claims injected by `custom_access_token_hook`
- Added try-catch for safety
- Defaults to 'student' role on error

**Commit Message**:
```
fix(auth): decode JWT claims for role extraction

Previously getUserRole() was reading from user.app_metadata.user_role,
but the custom access token hook injects the role into JWT claims instead.

This caused admin users to be incorrectly identified as students,
preventing access to admin dashboard features.

Changes:
- Read session.access_token instead of user
- Decode JWT payload to access custom claims
- Read user_role from JWT payload.user_role
- Add error handling with fallback to 'student'

Fixes role-based access control for admin users.
```

**Command**:
```bash
git add lib/supabase/get-user-role.ts
git commit -m "fix(auth): decode JWT claims for role extraction

Previously getUserRole() was reading from user.app_metadata.user_role,
but the custom access token hook injects the role into JWT claims instead.

This caused admin users to be incorrectly identified as students,
preventing access to admin dashboard features.

Changes:
- Read session.access_token instead of user
- Decode JWT payload to access custom claims
- Read user_role from JWT payload.user_role
- Add error handling with fallback to 'student'

Fixes role-based access control for admin users."
```

---

## Commit 2: feat(auth): enable custom access token hook in Supabase

**Type**: feat
**Scope**: auth
**Why**: Feature enablement - allows JWT role injection

**Files**:
- `supabase/config.toml`

**Changes**:
- Uncommented `[auth.hook.custom_access_token]` section
- Set `enabled = true`
- Configured URI to point to database function
- Hook now runs on every authentication

**Commit Message**:
```
feat(auth): enable custom access token hook in Supabase

Enable the custom_access_token_hook to inject user roles into JWT claims
on every authentication request.

Configuration:
- Enabled auth.hook.custom_access_token
- Set URI to pg-functions://postgres/public/custom_access_token_hook
- Hook executes automatically on token generation

This allows role-based access control by reading from JWT payload
instead of making additional database queries.

Required Supabase restart to take effect.
```

**Command**:
```bash
git add supabase/config.toml
git commit -m "feat(auth): enable custom access token hook in Supabase

Enable the custom_access_token_hook to inject user roles into JWT claims
on every authentication request.

Configuration:
- Enabled auth.hook.custom_access_token
- Set URI to pg-functions://postgres/public/custom_access_token_hook
- Hook executes automatically on token generation

This allows role-based access control by reading from JWT payload
instead of making additional database queries.

Required Supabase restart to take effect."
```

---

## Commit 3: feat(admin): implement payment request management system

**Type**: feat
**Scope**: admin
**Why**: Major new feature for manual payment workflow

**Files**:
- `app/dashboard/admin/payment-requests/page.tsx`
- `app/actions/payment-requests.ts`
- `components/admin/payment-requests-table.tsx`
- `components/admin/payment-request-dialog.tsx`
- `lib/supabase/admin.ts` (if new)
- `supabase/migrations/20260201160000_create_payment_requests_table.sql`

**Changes**:
- Complete admin dashboard for managing payment requests
- Status workflow: pending → contacted → payment_received → completed
- Statistics cards showing counts by status
- Filterable tabs for each status
- Payment request management dialog with:
  - Student contact details
  - Payment method and instructions fields
  - Status selector
  - Quick actions (mark as contacted, confirm payment & enroll)
- Server actions for CRUD operations
- Automatic enrollment on payment confirmation
- Invoice generation (HTML)

**Commit Message**:
```
feat(admin): implement payment request management system

Add comprehensive admin dashboard for managing manual payment requests
from students. Supports complete workflow from initial request to
course enrollment.

Features:
- Payment requests dashboard at /dashboard/admin/payment-requests
- Real-time statistics (pending, contacted, payment received, completed)
- Filterable tabs by status
- Payment request detail dialog with:
  - Student contact information
  - Product and amount details
  - Payment method and instructions
  - Internal admin notes
  - Status management
  - Quick actions (contact, confirm & enroll)
- Automatic student enrollment on payment confirmation
- Invoice generation with unique invoice numbers
- Transaction record creation for audit trail

Database:
- New payment_requests table with comprehensive fields
- RLS policies for admin-only access
- Proper foreign key relationships

Server Actions:
- createPaymentRequest() - Student submits request
- updatePaymentRequest() - Admin updates status/details
- confirmPaymentAndEnroll() - Enrolls student in linked courses
- generateInvoice() - Creates invoice number and metadata

Workflow:
1. Student submits payment request
2. Admin reviews and sends payment instructions
3. Admin marks as "contacted"
4. Student makes payment
5. Admin confirms payment
6. System automatically enrolls student in all linked courses
7. Transaction record created for tracking

Related: Manual payment system for offline/bank transfer payments
```

**Command**:
```bash
git add app/dashboard/admin/payment-requests/
git add app/actions/payment-requests.ts
git add components/admin/payment-requests-table.tsx
git add components/admin/payment-request-dialog.tsx
git add lib/supabase/admin.ts
git add supabase/migrations/20260201160000_create_payment_requests_table.sql
git commit -F- <<'EOF'
feat(admin): implement payment request management system

Add comprehensive admin dashboard for managing manual payment requests
from students. Supports complete workflow from initial request to
course enrollment.

Features:
- Payment requests dashboard at /dashboard/admin/payment-requests
- Real-time statistics (pending, contacted, payment received, completed)
- Filterable tabs by status
- Payment request detail dialog with:
  - Student contact information
  - Product and amount details
  - Payment method and instructions
  - Internal admin notes
  - Status management
  - Quick actions (contact, confirm & enroll)
- Automatic student enrollment on payment confirmation
- Invoice generation with unique invoice numbers
- Transaction record creation for audit trail

Database:
- New payment_requests table with comprehensive fields
- RLS policies for admin-only access
- Proper foreign key relationships

Server Actions:
- createPaymentRequest() - Student submits request
- updatePaymentRequest() - Admin updates status/details
- confirmPaymentAndEnroll() - Enrolls student in linked courses
- generateInvoice() - Creates invoice number and metadata

Workflow:
1. Student submits payment request
2. Admin reviews and sends payment instructions
3. Admin marks as "contacted"
4. Student makes payment
5. Admin confirms payment
6. System automatically enrolls student in all linked courses
7. Transaction record created for tracking

Related: Manual payment system for offline/bank transfer payments
EOF
```

---

## Commit 4: feat(student): add manual payment request interface

**Type**: feat
**Scope**: student
**Why**: Student-facing UI for payment requests

**Files**:
- `components/student/manual-payment-dialog.tsx`
- `components/student/manual-payment-button.tsx`

**Changes**:
- Payment request dialog with form fields
- Contact information collection (name, email, phone, message)
- Form validation
- Submit action integration
- Success/error toast notifications

**Commit Message**:
```
feat(student): add manual payment request interface

Add student-facing interface for requesting payment information for
manual/offline payment products.

Components:
- ManualPaymentButton - Triggers payment request dialog
- ManualPaymentDialog - Form for collecting contact information

Features:
- Contact form with validation:
  - Full name (required)
  - Email (required)
  - Phone number (optional)
  - Additional message (optional)
- Product information display
- Payment workflow explanation
- Toast notifications for success/error
- Form reset on successful submission

Integrates with createPaymentRequest server action to save request
to database with 'pending' status.

Students use this when purchasing products with manual payment method
(bank transfer, cash, etc.) instead of online payments.
```

**Command**:
```bash
git add components/student/manual-payment-dialog.tsx
git add components/student/manual-payment-button.tsx
git commit -F- <<'EOF'
feat(student): add manual payment request interface

Add student-facing interface for requesting payment information for
manual/offline payment products.

Components:
- ManualPaymentButton - Triggers payment request dialog
- ManualPaymentDialog - Form for collecting contact information

Features:
- Contact form with validation:
  - Full name (required)
  - Email (required)
  - Phone number (optional)
  - Additional message (optional)
- Product information display
- Payment workflow explanation
- Toast notifications for success/error
- Form reset on successful submission

Integrates with createPaymentRequest server action to save request
to database with 'pending' status.

Students use this when purchasing products with manual payment method
(bank transfer, cash, etc.) instead of online payments.
EOF
```

---

## Commit 5: feat(products): create public product pages

**Type**: feat
**Scope**: products
**Why**: Public-facing pages for product discovery

**Files**:
- `app/(public)/products/page.tsx`
- `app/(public)/products/[productId]/page.tsx`

**Changes**:
- Public products listing page
- Individual product detail pages
- Product card display
- Payment method information
- Manual payment button integration
- Authentication check for purchase access

**Commit Message**:
```
feat(products): create public product pages

Add public-facing product pages for students to discover and purchase
courses via products system.

Pages:
- /products - List all active products
- /products/[productId] - Product detail and purchase

Features:
- Product listing with cards:
  - Product name and description
  - Price and currency
  - Payment method indicator
- Product detail page:
  - Full product information
  - Payment method explanation
  - "Request Payment Information" button for manual products
  - "Login" prompt for unauthenticated users
- Support for manual/offline payment workflow
- Redirect to products list if product not found

Integration:
- Connects to products table
- Checks user authentication
- Triggers manual payment request dialog
- Handles Next.js 16 async params correctly

Students use these pages to browse available products and initiate
purchase/enrollment process.
```

**Command**:
```bash
git add app/(public)/products/
git commit -F- <<'EOF'
feat(products): create public product pages

Add public-facing product pages for students to discover and purchase
courses via products system.

Pages:
- /products - List all active products
- /products/[productId] - Product detail and purchase

Features:
- Product listing with cards:
  - Product name and description
  - Price and currency
  - Payment method indicator
- Product detail page:
  - Full product information
  - Payment method explanation
  - "Request Payment Information" button for manual products
  - "Login" prompt for unauthenticated users
- Support for manual/offline payment workflow
- Redirect to products list if product not found

Integration:
- Connects to products table
- Checks user authentication
- Triggers manual payment request dialog
- Handles Next.js 16 async params correctly

Students use these pages to browse available products and initiate
purchase/enrollment process.
EOF
```

---

## Commit 6: feat(admin): add invoice generation system

**Type**: feat
**Scope**: admin
**Why**: Professional invoicing for manual payments

**Files**:
- `app/api/invoices/[invoiceNumber]/route.ts`
- `lib/invoice-generator.ts`

**Changes**:
- Invoice API route for viewing/printing invoices
- HTML invoice template with professional styling
- Invoice number generation
- Company branding support via environment variables
- Print-friendly CSS

**Commit Message**:
```
feat(admin): add invoice generation system

Implement professional invoice generation for manual payment requests.
Invoices are accessible via unique invoice numbers and render as
print-friendly HTML pages.

Features:
- Automatic invoice numbering (format: INV-{timestamp}-{requestId})
- Professional HTML invoice template
- Company branding (configurable via env vars)
- Student and product details
- Payment instructions included
- Print-friendly CSS styling
- Access control (student or admin only)

API Route:
- GET /api/invoices/[invoiceNumber]
- Returns HTML invoice page
- Validates access permissions
- 404 if invoice not found

Invoice Template:
- Company header with logo
- Invoice metadata (number, date, due date)
- Bill to section (student details)
- Itemized product list
- Payment instructions
- Footer with company info

Environment Variables (Optional):
- COMPANY_NAME
- COMPANY_ADDRESS
- COMPANY_EMAIL
- COMPANY_PHONE

Invoices can be printed to PDF using browser print function.
Future enhancement: Direct PDF generation with Puppeteer.
```

**Command**:
```bash
git add app/api/invoices/
git add lib/invoice-generator.ts
git commit -F- <<'EOF'
feat(admin): add invoice generation system

Implement professional invoice generation for manual payment requests.
Invoices are accessible via unique invoice numbers and render as
print-friendly HTML pages.

Features:
- Automatic invoice numbering (format: INV-{timestamp}-{requestId})
- Professional HTML invoice template
- Company branding (configurable via env vars)
- Student and product details
- Payment instructions included
- Print-friendly CSS styling
- Access control (student or admin only)

API Route:
- GET /api/invoices/[invoiceNumber]
- Returns HTML invoice page
- Validates access permissions
- 404 if invoice not found

Invoice Template:
- Company header with logo
- Invoice metadata (number, date, due date)
- Bill to section (student details)
- Itemized product list
- Payment instructions
- Footer with company info

Environment Variables (Optional):
- COMPANY_NAME
- COMPANY_ADDRESS
- COMPANY_EMAIL
- COMPANY_PHONE

Invoices can be printed to PDF using browser print function.
Future enhancement: Direct PDF generation with Puppeteer.
EOF
```

---

## Commit 7: fix(admin): separate query for product courses in enrollment

**Type**: fix
**Scope**: admin
**Why**: Bug fix for nested Supabase query issue

**Files**:
- `app/actions/payment-requests.ts` (modification)

**Changes**:
- Separate the nested product_courses query into independent query
- Prevents `map is not a function` error
- Makes enrollment process more reliable

**Commit Message**:
```
fix(admin): separate query for product courses in enrollment

Fix enrollment failure caused by nested Supabase query not returning
array correctly.

Problem:
- confirmPaymentAndEnroll() used nested select for product courses
- request.product.courses.map() failed with "not a function"
- Nested query didn't return proper array structure

Solution:
- Split into two separate queries:
  1. Get payment request with product info
  2. Get product_courses separately
- More reliable and debuggable
- Handles empty course list gracefully

Changes in confirmPaymentAndEnroll():
- Query payment_requests with product (no nested courses)
- Separate query: product_courses filtered by product_id
- Map course IDs from second query results
- Enrollment process continues as before

Tested: Manual payment enrollment now works end-to-end.
```

**Command**:
```bash
git add app/actions/payment-requests.ts
git commit -m "fix(admin): separate query for product courses in enrollment

Fix enrollment failure caused by nested Supabase query not returning
array correctly.

Problem:
- confirmPaymentAndEnroll() used nested select for product courses
- request.product.courses.map() failed with \"not a function\"
- Nested query didn't return proper array structure

Solution:
- Split into two separate queries:
  1. Get payment request with product info
  2. Get product_courses separately
- More reliable and debuggable
- Handles empty course list gracefully

Changes in confirmPaymentAndEnroll():
- Query payment_requests with product (no nested courses)
- Separate query: product_courses filtered by product_id
- Map course IDs from second query results
- Enrollment process continues as before

Tested: Manual payment enrollment now works end-to-end."
```

---

## Commit 8: feat(admin): implement comprehensive user and course management

**Type**: feat
**Scope**: admin
**Why**: Major admin dashboard features

**Files**:
- `app/dashboard/admin/users/`
- `app/dashboard/admin/courses/`
- `app/dashboard/admin/categories/`
- `app/dashboard/admin/enrollments/`
- `app/dashboard/admin/transactions/`
- `app/dashboard/admin/products/`
- `app/dashboard/admin/plans/`
- `components/admin/` (all components)
- `app/actions/admin/` (all actions)
- `supabase/migrations/20260201145244_admin_dashboard_setup.sql`

**Commit Message**:
```
feat(admin): implement comprehensive user and course management

Add complete admin dashboard with user management, course oversight,
product/plan management, and platform analytics.

User Management:
- List all users with search and filters
- User detail page with activity, enrollments, transactions
- Role assignment dialog (admin, teacher, student)
- User deactivation/reactivation
- Profile management

Course Management:
- Course approval workflow (draft → published)
- Course archival and restoration
- Category management (CRUD)
- Course statistics and oversight

Products & Plans:
- Product creation with Stripe integration
- Manual and online payment product support
- Subscription plan management
- Course linking to products

Enrollments:
- Enrollment tracking and management
- Manual enrollment capabilities
- Enrollment statistics

Transactions:
- Transaction history
- Revenue analytics
- Payment method tracking

Database Changes:
- Add deactivated_at to profiles
- Add status, archived_at to courses
- Add Stripe fields to products and plans
- Enable RLS on user_roles table
- Create admin policies

Components:
- UsersTable with search and filters
- RoleAssignmentDialog for user role management
- CourseStatusActions for approve/archive
- Category management dialogs
- Product and plan forms
- Confirm dialogs for destructive actions

Security:
- All actions verify admin access
- Service role client used securely
- RLS policies protect sensitive data
- Soft deletes preserve data integrity
```

**Command**:
```bash
git add app/dashboard/admin/users/
git add app/dashboard/admin/courses/
git add app/dashboard/admin/categories/
git add app/dashboard/admin/enrollments/
git add app/dashboard/admin/transactions/
git add app/dashboard/admin/products/
git add app/dashboard/admin/plans/
git add components/admin/
git add app/actions/admin/
git add supabase/migrations/20260201145244_admin_dashboard_setup.sql
git commit -F- <<'EOF'
feat(admin): implement comprehensive user and course management

Add complete admin dashboard with user management, course oversight,
product/plan management, and platform analytics.

User Management:
- List all users with search and filters
- User detail page with activity, enrollments, transactions
- Role assignment dialog (admin, teacher, student)
- User deactivation/reactivation
- Profile management

Course Management:
- Course approval workflow (draft → published)
- Course archival and restoration
- Category management (CRUD)
- Course statistics and oversight

Products & Plans:
- Product creation with Stripe integration
- Manual and online payment product support
- Subscription plan management
- Course linking to products

Enrollments:
- Enrollment tracking and management
- Manual enrollment capabilities
- Enrollment statistics

Transactions:
- Transaction history
- Revenue analytics
- Payment method tracking

Database Changes:
- Add deactivated_at to profiles
- Add status, archived_at to courses
- Add Stripe fields to products and plans
- Enable RLS on user_roles table
- Create admin policies

Components:
- UsersTable with search and filters
- RoleAssignmentDialog for user role management
- CourseStatusActions for approve/archive
- Category management dialogs
- Product and plan forms
- Confirm dialogs for destructive actions

Security:
- All actions verify admin access
- Service role client used securely
- RLS policies protect sensitive data
- Soft deletes preserve data integrity
EOF
```

---

## Commit 9: feat(ui): add new shadcn components and theme provider

**Type**: feat
**Scope**: ui
**Why**: UI component additions for new features

**Files**:
- `components/ui/dialog.tsx`
- `components/ui/table.tsx`
- `components/ui/tabs.tsx`
- `components/ui/select.tsx`
- `components/ui/textarea.tsx`
- `components/ui/badge.tsx`
- `components/ui/sonner.tsx`
- `components/ui/sidebar.tsx`
- `components/ui/tooltip.tsx`
- `components/ui/accordion.tsx`
- `components/ui/alert.tsx`
- `components/ui/avatar.tsx`
- `components/ui/breadcrumb.tsx`
- `components/ui/button-group.tsx`
- `components/ui/carousel.tsx`
- `components/ui/checkbox.tsx`
- `components/ui/collapsible.tsx`
- `components/ui/command.tsx`
- `components/ui/hover-card.tsx`
- `components/ui/popover.tsx`
- `components/ui/scroll-area.tsx`
- `components/ui/sheet.tsx`
- `components/ui/skeleton.tsx`
- `components/ui/slider.tsx`
- `components/ui/switch.tsx`
- `components/theme-provider.tsx`
- `components/app-sidebar.tsx`

**Commit Message**:
```
feat(ui): add new shadcn components and theme provider

Add required shadcn/ui components for admin dashboard, payment system,
and enhanced user interfaces.

New Components:
- Dialog - Modal dialogs for forms and confirmations
- Table - Data tables with sorting and filtering
- Tabs - Tab navigation for payment request states
- Select - Dropdown selections
- Textarea - Multi-line text inputs
- Badge - Status indicators
- Sonner - Toast notifications
- Sidebar - Navigation sidebar
- Tooltip - Contextual help
- Accordion, Alert, Avatar, Breadcrumb
- Button Group, Carousel, Checkbox, Collapsible
- Command (Cmd+K), Hover Card, Popover
- Scroll Area, Sheet, Skeleton, Slider, Switch

Theme:
- ThemeProvider for dark/light mode support
- AppSidebar for unified navigation
- Consistent styling across platform

All components follow shadcn/ui patterns and are fully typed.
```

**Command**:
```bash
git add components/ui/
git add components/theme-provider.tsx
git add components/app-sidebar.tsx
git commit -m "feat(ui): add new shadcn components and theme provider

Add required shadcn/ui components for admin dashboard, payment system,
and enhanced user interfaces.

New Components:
- Dialog - Modal dialogs for forms and confirmations
- Table - Data tables with sorting and filtering
- Tabs - Tab navigation for payment request states
- Select - Dropdown selections
- Textarea - Multi-line text inputs
- Badge - Status indicators
- Sonner - Toast notifications
- Sidebar - Navigation sidebar
- Tooltip - Contextual help
- Accordion, Alert, Avatar, Breadcrumb
- Button Group, Carousel, Checkbox, Collapsible
- Command (Cmd+K), Hover Card, Popover
- Scroll Area, Sheet, Skeleton, Slider, Switch

Theme:
- ThemeProvider for dark/light mode support
- AppSidebar for unified navigation
- Consistent styling across platform

All components follow shadcn/ui patterns and are fully typed."
```

---

## Commit 10: feat(db): add database migrations for new features

**Type**: feat
**Scope**: db
**Why**: Database schema changes

**Files**:
- `supabase/migrations/20260130225216_fix_lesson_completion_rls.sql`
- `supabase/migrations/20260131170137_fix_lesson_completions_rls.sql`
- `supabase/migrations/20260131170225_create_comments_table.sql`
- `supabase/migrations/20260131170300_fix_reviews_schema.sql`
- `supabase/migrations/20260131170323_ensure_admin_user.sql`
- `supabase/migrations/20260131180000_add_ai_task_to_lessons.sql`
- `supabase/migrations/20260131181000_ensure_review_id.sql`
- `supabase/migrations/20260131190000_create_ai_task_tables.sql`
- `supabase/migrations/20260131210806_create_missing_profiles.sql`
- `supabase/migrations/20260131220000_create_prompt_templates.sql`
- `supabase/migrations/20260131220100_seed_prompt_templates.sql`
- `supabase/migrations/20260131220200_add_teacher_override_to_exam_scores.sql`
- `supabase/migrations/20260131220300_create_teacher_preview_sessions.sql`
- `supabase/migrations/20260131220400_fix_lessons_ai_tasks_columns.sql`
- `supabase/seed.sql`

**Commit Message**:
```
feat(db): add database migrations for new features

Add comprehensive database migrations for AI integration, comments,
reviews, and admin features.

Migrations:
- Fix lesson_completion RLS policies
- Create comments table for lesson discussions
- Fix reviews schema and add proper constraints
- Ensure admin user exists for testing
- Add AI task fields to lessons
- Create AI task tables (prompts, templates)
- Create missing profiles for existing users
- Add prompt templates for AI features
- Add teacher override capability to exam scores
- Create teacher preview sessions table
- Fix lesson AI task column types

Seed Data:
- Default categories
- Sample courses and lessons
- Admin user setup
- Prompt templates for AI grading

All migrations are idempotent and can be run multiple times safely.
```

**Command**:
```bash
git add supabase/migrations/
git add supabase/seed.sql
git commit -F- <<'EOF'
feat(db): add database migrations for new features

Add comprehensive database migrations for AI integration, comments,
reviews, and admin features.

Migrations:
- Fix lesson_completion RLS policies
- Create comments table for lesson discussions
- Fix reviews schema and add proper constraints
- Ensure admin user exists for testing
- Add AI task fields to lessons
- Create AI task tables (prompts, templates)
- Create missing profiles for existing users
- Add prompt templates for AI features
- Add teacher override capability to exam scores
- Create teacher preview sessions table
- Fix lesson AI task column types

Seed Data:
- Default categories
- Sample courses and lessons
- Admin user setup
- Prompt templates for AI grading

All migrations are idempotent and can be run multiple times safely.
EOF
```

---

## Commit 11: docs: add comprehensive project documentation

**Type**: docs
**Scope**: docs
**Why**: Documentation for all new features

**Files**:
- `docs/ADMIN_DASHBOARD_IMPLEMENTATION.md`
- `docs/AI_INTEGRATION.md`
- `docs/DATABASE_FIXES_APPLIED.md`
- `docs/I18N_GUIDE.md`
- `docs/MANUAL_PAYMENT_COMPLETE.md`
- `docs/MANUAL_PAYMENT_SYSTEM.md`
- `docs/PROJECT_COMPLETE.md`
- `docs/TESTING_JOURNEY.md`
- `docs/TESTING_STATUS.md`
- `docs/TESTING_SUMMARY.md`
- `docs/TEST_REPORT.md`
- `ADMIN_IMPLEMENTATION_SUMMARY.md`
- `CLAUDE.md`
- `CHANGELOG.md`
- `FINAL_SUMMARY.md`
- `IMPLEMENTATION_COMPLETE.md`
- `IMPLEMENTATION_SUMMARY.md`
- `MIGRATION_GUIDE.md`
- `PHASE_3_COMPLETE.md`
- `PLAYWRIGHT_TEST_COMPLETE.md`
- `PLAYWRIGHT_TEST_REPORT.md`
- `TESTING_GUIDE.md`
- `MVP_COMPLETION_ROADMAP.md`

**Commit Message**:
```
docs: add comprehensive project documentation

Add complete documentation for manual payment system, admin dashboard,
AI integration, testing, and MVP completion roadmap.

Documentation Added:

Admin Features:
- ADMIN_DASHBOARD_IMPLEMENTATION.md - Implementation progress
- ADMIN_IMPLEMENTATION_SUMMARY.md - Feature summary

Manual Payments:
- MANUAL_PAYMENT_COMPLETE.md - Complete implementation guide
- MANUAL_PAYMENT_SYSTEM.md - System architecture and workflows

AI Integration:
- AI_INTEGRATION.md - Gemini 2.0 integration guide
- Exam auto-grading patterns
- Exercise chat assistant patterns

Testing:
- PLAYWRIGHT_TEST_COMPLETE.md - E2E test results
- PLAYWRIGHT_TEST_REPORT.md - Detailed test report
- TESTING_JOURNEY.md - Testing process documentation
- TESTING_GUIDE.md - How to test the platform

Project Status:
- PROJECT_COMPLETE.md - All 10 phases complete
- MVP_COMPLETION_ROADMAP.md - Remaining work for production
- IMPLEMENTATION_COMPLETE.md - Feature completion status
- FINAL_SUMMARY.md - Project summary

Development:
- CLAUDE.md - AI development guide
- CHANGELOG.md - Complete change history
- MIGRATION_GUIDE.md - V1 to V2 migration
- I18N_GUIDE.md - Internationalization guide

All documentation includes:
- Step-by-step implementation guides
- Code examples
- Testing checklists
- API references
- Troubleshooting guides
```

**Command**:
```bash
git add docs/
git add *.md
git commit -F- <<'EOF'
docs: add comprehensive project documentation

Add complete documentation for manual payment system, admin dashboard,
AI integration, testing, and MVP completion roadmap.

Documentation Added:

Admin Features:
- ADMIN_DASHBOARD_IMPLEMENTATION.md - Implementation progress
- ADMIN_IMPLEMENTATION_SUMMARY.md - Feature summary

Manual Payments:
- MANUAL_PAYMENT_COMPLETE.md - Complete implementation guide
- MANUAL_PAYMENT_SYSTEM.md - System architecture and workflows

AI Integration:
- AI_INTEGRATION.md - Gemini 2.0 integration guide
- Exam auto-grading patterns
- Exercise chat assistant patterns

Testing:
- PLAYWRIGHT_TEST_COMPLETE.md - E2E test results
- PLAYWRIGHT_TEST_REPORT.md - Detailed test report
- TESTING_JOURNEY.md - Testing process documentation
- TESTING_GUIDE.md - How to test the platform

Project Status:
- PROJECT_COMPLETE.md - All 10 phases complete
- MVP_COMPLETION_ROADMAP.md - Remaining work for production
- IMPLEMENTATION_COMPLETE.md - Feature completion status
- FINAL_SUMMARY.md - Project summary

Development:
- CLAUDE.md - AI development guide
- CHANGELOG.md - Complete change history
- MIGRATION_GUIDE.md - V1 to V2 migration
- I18N_GUIDE.md - Internationalization guide

All documentation includes:
- Step-by-step implementation guides
- Code examples
- Testing checklists
- API references
- Troubleshooting guides
EOF
```

---

## Commit 12: chore: update dependencies and configuration files

**Type**: chore
**Scope**: config
**Why**: Configuration and dependency updates

**Files**:
- `package.json`
- `package-lock.json`
- `next.config.ts`
- `.gitignore`
- `.mcp.json`
- `playwright.config.ts`
- Remaining modified files from various dashboards

**Commit Message**:
```
chore: update dependencies and configuration files

Update project dependencies, Next.js configuration, and tooling setup
for new features.

Package Updates:
- Add Playwright for E2E testing
- Add additional UI dependencies
- Update existing packages to latest compatible versions

Configuration:
- Update Next.js config for new routes
- Add Playwright test configuration
- Update .gitignore for test artifacts and build files
- Configure MCP for agent-based testing

Dashboard Updates:
- Update admin dashboard main page
- Update student dashboard pages
- Update teacher dashboard pages
- Add proper layouts and navigation

Miscellaneous:
- Remove deprecated middleware.ts
- Remove unused app/page.tsx (using (public) routes)
- Update login and password forms
- Add test scripts and utilities

All changes maintain backward compatibility and follow project
conventions.
```

**Command**:
```bash
git add package.json package-lock.json
git add next.config.ts .gitignore .mcp.json
git add playwright.config.ts
git add app/dashboard/
git add app/layout.tsx
git add components/login-form.tsx
git add components/update-password-form.tsx
git add components/teacher/
git add components/student/
git add lib/
git add hooks/
git add proxy.ts
git rm app/page.tsx
git rm lib/supabase/middleware.ts
git commit -F- <<'EOF'
chore: update dependencies and configuration files

Update project dependencies, Next.js configuration, and tooling setup
for new features.

Package Updates:
- Add Playwright for E2E testing
- Add additional UI dependencies
- Update existing packages to latest compatible versions

Configuration:
- Update Next.js config for new routes
- Add Playwright test configuration
- Update .gitignore for test artifacts and build files
- Configure MCP for agent-based testing

Dashboard Updates:
- Update admin dashboard main page
- Update student dashboard pages
- Update teacher dashboard pages
- Add proper layouts and navigation

Miscellaneous:
- Remove deprecated middleware.ts
- Remove unused app/page.tsx (using (public) routes)
- Update login and password forms
- Add test scripts and utilities

All changes maintain backward compatibility and follow project
conventions.
EOF
```

---

## Execution Order

Run these commits in sequence:

```bash
# 1. Fix authentication (critical)
# 2. Enable JWT hook (critical)
# 3. Payment request system (major feature)
# 4. Student payment interface
# 5. Public product pages
# 6. Invoice generation
# 7. Fix enrollment bug
# 8. Admin dashboard features
# 9. UI components
# 10. Database migrations
# 11. Documentation
# 12. Configuration and cleanup
```

---

## Post-Commit Verification

After all commits:

```bash
# Verify commit history
git log --oneline -12

# Verify no uncommitted changes
git status

# Verify build still works
npm run build

# Push to remote
git push origin v2-rebuild
```

---

## Notes

- All commits follow Conventional Commits format
- Commit messages include detailed context and changes
- Related files are grouped logically
- Breaking changes are clearly marked
- Each commit represents a complete, logical unit of work
- Commits can be reviewed/reverted independently

---

**Total Commits**: 12
**Estimated Time**: 30-45 minutes to execute all commits
**Branch**: v2-rebuild
**Target**: master (after review)
