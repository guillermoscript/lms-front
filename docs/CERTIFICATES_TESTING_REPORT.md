# Certificates E2E Testing Report

**Date:** February 17, 2026
**Status:** TESTED — Full certificates pipeline verified across all roles
**Environment:** Local Supabase + Next.js dev server with `lvh.me` wildcard DNS

---

## Overview

End-to-end browser testing of the certificates flow: template creation (teacher), certificate issuance (student self-serve), certificate viewing (student), and public verification (anonymous).

---

## Test Accounts

| Account | Role | Tenant |
|---------|------|--------|
| `owner@e2etest.com` | Teacher | Default School (`lvh.me:3000`) |
| `student@e2etest.com` | Student | Default School (`lvh.me:3000`) |
| Anonymous | Public | N/A |

---

## Test Results

### 1. Teacher: Create Certificate Template — PASS

- Navigated to `/dashboard/teacher/courses/1` → Certificates tab
- Created template: "Introduction to Testing Certification"
- Issuer: "LMS Academy"
- Template saved to `certificate_templates` table with `tenant_id`

### 2. Student: Certificate Eligibility & Issuance — PASS

- Student had 100% lesson completion on "Introduction to Testing"
- Called `/api/certificates/issue?courseId=1` eligibility check
- Certificate issued via `check_and_issue_certificate` RPC
- Verification code generated: `LBPYI81G0XAQYB30A6L3`

### 3. Student: View Certificates Page — PASS

- `/dashboard/student/certificates` shows 1 certificate
- Card displays: title, issuer, issue date, verification badge
- Buttons: Download PDF, Verify, Share

### 4. Student: Progress Report Page — PASS

- `/dashboard/student/progress` shows 2 courses with progress bars
- Stats: courses enrolled, lessons completed, exams completed, avg score
- Per-course progress with status badges

### 5. Public: Verification Page — PASS (after fixes)

- `/verify/LBPYI81G0XAQYB30A6L3` shows verified certificate
- Displays: recipient name, course title, issuer, issue date, status "Active & Valid"
- Accessible without authentication

### 6. Teacher: View Issued Certificates — PASS

- Certificates tab shows template config + issued certificates table
- Table shows: student name, issue date, verification code, actions

---

## Bugs Found & Fixed

### Bug 1: `certificate_templates` missing `tenant_id`

**Severity:** HIGH
**Symptom:** Teacher's Certificates tab showed "No template configured" even after saving a template.
**Root Cause:** `certificate_templates` table had no `tenant_id` column. The teacher course page filtered by `tenant_id`, returning no results.
**Fix:** Migration `add_tenant_id_to_certificate_templates` — added column, backfilled from courses, made NOT NULL with FK.

### Bug 2: Certificate RPCs not `SECURITY DEFINER`

**Severity:** HIGH
**Symptom:** Student eligibility check returned "No active certificate template."
**Root Cause:** `check_and_issue_certificate` and `calculate_course_completion` RPCs ran as `SECURITY INVOKER`. RLS on `certificate_templates` only allowed teacher/admin reads, blocking students.
**Fix:** Migration `fix_certificate_rpc_security_and_student_rls` — made both RPCs `SECURITY DEFINER`, added student SELECT policy on `certificate_templates` and INSERT policy on `certificates`.

### Bug 3: Verification page shows "Invalid Certificate"

**Severity:** HIGH
**Symptom:** `/verify/[code]` always showed "Invalid Certificate" for valid codes.
**Root Cause:** Three issues combined:
1. Used `createClient()` (RLS-bound) — anonymous/different users blocked by RLS
2. `certificates` has two FKs to `profiles` (`user_id` and `revoked_by`) — PostgREST can't resolve ambiguous join `profiles(...)`
3. Query selected `courses(title, slug)` but `courses` has no `slug` column — PostgREST error

**Fix:**
- Switched to `createAdminClient()` (service role bypasses RLS for public verification)
- Added FK hint: `profiles!certificates_user_id_fkey(full_name, avatar_url)`
- Changed to `courses(course_id, title)` and updated course link to use `course_id`

### Bug 4: Teacher certificates query — ambiguous FK

**Severity:** MEDIUM
**Symptom:** Issued certificates table on teacher's Certificates tab could fail to load profiles.
**Root Cause:** Same ambiguous `profiles` FK as Bug 3 — `certificates` → `profiles` has two foreign keys.
**Fix:** Added FK hint `profiles!certificates_user_id_fkey(full_name, avatar_url)` to teacher course page query.

### Bug 5: `calculate_course_completion` used non-existent join

**Severity:** MEDIUM
**Symptom:** Eligibility check failed for students who should be eligible.
**Root Cause:** Function joined `exam_submissions` with `exam_scores` table (doesn't exist). Also, `requires_all_exams = true` default blocked issuance when student hadn't taken exams.
**Fix:** Rewrote function to use `exam_submissions` directly (has `score` column). Added edge case: if course has 0 exams, student is eligible based on lesson completion alone.

---

## Files Modified

| File | Changes |
|------|---------|
| `app/[locale]/verify/[code]/page.tsx` | Admin client, FK hint, removed `slug` |
| `app/[locale]/dashboard/teacher/courses/[courseId]/page.tsx` | FK hint on certificates query |
| `app/[locale]/dashboard/student/certificates/page.tsx` | NEW — certificates listing page |
| `app/[locale]/dashboard/student/progress/page.tsx` | NEW — progress report page |

## Migrations Applied

| Migration | Purpose |
|-----------|---------|
| `add_tenant_id_to_certificate_templates` | Added `tenant_id` to `certificate_templates`, backfilled, FK constraint |
| `fix_certificate_rpc_security_and_student_rls` | `SECURITY DEFINER` on RPCs, student RLS policies |

---

## Certificate Architecture

```
Teacher creates template
  → certificate_templates (tenant_id, course_id, template_name, issuer_name, design_settings)
  → design_settings: primary_color, secondary_color, show_qr_code, logo_url
  → signature_name, signature_title, signature_image_url, logo_url

Student requests certificate
  → POST /api/certificates/generate { courseId } (eligibility check + issuance)
  → check_and_issue_certificate RPC (SECURITY DEFINER)
    → calculate_course_completion (lesson % + exam scores)
    → If eligible: INSERT into certificates with verification_code + credential_json (Open Badges 3.0)

Student views certificate
  → /dashboard/student/certificates (server component, i18n via getTranslations)
  → StudentCertificateCard component (View, Download PDF, Verify, Share)
  → View links to public route: /api/certificates/view/[code]

Certificate rendering (3 outputs, all themed by template design_settings):
  → HTML view: /api/certificates/view/[code] (public, no auth)
    → lib/certificate-generator.ts (luxury aesthetic: Cormorant Garamond + DM Sans, guilloche SVG watermark, double-line frames, corner ornaments, flourish decorations)
  → PDF download: /api/certificates/[id]?format=pdf (auth required)
    → lib/certificates/pdf-generator.tsx (@react-pdf/renderer, matching luxury design: guilloche SVG, frames, seal, flourish, QR code)
  → Auth HTML view: /api/certificates/[id] (auth required, for logged-in students)

Public verification
  → /verify/[code] (admin client, no auth required, fully i18n en/es)
  → Shows: status badge, student name, course title, issuer info, credential type, issue date, score, signature, verification ID
  → Themed by template's primary/secondary colors
```

---

## March 2026 Updates

### Certificate UI Redesign (March 13, 2026)

**HTML Certificate** (`lib/certificate-generator.ts`):
- Luxury credential aesthetic replacing generic Bootstrap-style design
- Cormorant Garamond (display) + DM Sans (body) font pairing via Google Fonts
- Guilloche SVG watermark pattern generated from template's primary color
- Fine double-line frame with L-shaped corner ornaments and diamond accents
- Classical italic "Certificate of Completion" title
- Flourish decoration under student name
- Warm cream background (#fffef9)
- Template-driven: primary_color, secondary_color, logo, signature, issuer name

**PDF Certificate** (`lib/certificates/pdf-generator.tsx`):
- Complete rewrite matching HTML luxury aesthetic
- @react-pdf/renderer with SVG guilloche pattern
- Double-line frames, flourish decorations, monogram seal
- QR code with template-coordinated colors
- Signature name, title, and image support
- Reads all design_settings from certificate_templates

**Verify Page** (`app/[locale]/verify/[code]/page.tsx`):
- Premium editorial layout with warm cream background
- Verification status badge (Verified/Revoked) with color coding
- Issuer card with logo/monogram, structured credential details
- Full i18n: `verification` namespace with 19 keys in en + es
- Locale-aware date formatting (en-US / es-ES)
- Links to public certificate HTML view

**Public Certificate View Route** (`app/api/certificates/view/[code]/route.ts`):
- New public route — no authentication required
- Renders certificate HTML using `createAdminClient()`
- 1-hour cache header for performance
- Replaces auth-protected `/api/certificates/[id]` for public links

**i18n Coverage**:
- New `verification` namespace (19 keys): verify page labels, status badges, footer text
- `dashboard.student.certificates`: added `myCourses`, `statsTotal`, `statsCourses`, `statsLatest`
- `dashboard.student.profile.certificates`: added `verified`
- Student certificate card: hardcoded "Certificate", "Verified" replaced with i18n keys
- Certificate preview: date locale fixed from hardcoded `'en-US'` to browser locale
- All dates use locale-aware formatting

### DB Trigger Fixes (March 12, 2026)

**Migration**: `20260312000100_fix_lesson_completion_trigger_and_issuance.sql`
- `handle_lesson_completion_xp`: removed `NEW.tenant_id` (column doesn't exist on `lesson_completions`), fixed `l.lesson_id` → `l.id`
- `issue_certificate_if_eligible`: added `credential_json` to INSERT (NOT NULL constraint), added lookups for `issuer_name`, `course_title`, `student_name`

**Code fix**: `lesson-navigation.tsx` — removed `tenant_id` from `lesson_completions` insert
