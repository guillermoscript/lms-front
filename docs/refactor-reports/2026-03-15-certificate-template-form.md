# Certificate Template Form -- Mutations + Compound Split

**Date:** 2026-03-15
**Subtask:** 1.7
**Status:** PASS

## What Changed

### 1. New Server Action: `app/actions/teacher/certificates.ts`
- `upsertCertificateTemplate(courseId, data)` -- uses `actionHandler` wrapper with `requireTeacherOrAdmin` and `verifyCourseOwnership` guards.
- Validates `template_name` and `issuer_name` are non-empty.
- Upserts into `certificate_templates` with `onConflict: 'course_id,tenant_id'`.
- Calls `revalidatePath` on the certificates route after success.

### 2. Compound Component Split (692-line monolith -> 9 files)

| File | Lines | Responsibility |
|------|-------|----------------|
| `index.tsx` | 2 | Barrel export |
| `certificate-template-form.tsx` | 84 | Shell: layout grid, submit buttons, preview |
| `certificate-template-context.tsx` | 202 | Context provider, state, all handlers (submit, upload, field updates) |
| `certificate-info-section.tsx` | 70 | Name, description, issuance criteria fields |
| `issuer-section.tsx` | 107 | Issuer name/URL, logo upload |
| `signature-section.tsx` | 107 | Signer name/title, signature image upload |
| `completion-criteria-section.tsx` | 76 | Lesson completion slider, exam score slider, require-all toggle |
| `expiration-section.tsx` | 70 | Expiration on/off switch, days input |
| `design-section.tsx` | 116 | Color presets, custom color pickers, QR code toggle |

## Testing Checklist

| # | Step | Result |
|---|------|--------|
| 1 | Login as teacher/admin, navigate to course -> Certificates -> Settings | PASS -- Form loaded at `/dashboard/teacher/courses/2001/certificates/settings` |
| 2 | Form loads (empty for new template) | PASS -- All 6 sections rendered with default values. Breadcrumb shows "Create Template" |
| 3 | Fill certificate name and description | PASS -- "Python Mastery Certificate" and description text accepted |
| 4 | Set completion criteria (lesson %, exam score) | PASS -- Sliders show 100% lesson and 70% exam. "Require All Exams" toggle works |
| 5 | Change design colors (Emerald preset) | PASS -- Preset buttons switch colors. Primary changed to #10B981, secondary to #047857 |
| 6 | Save -- verify success | PASS -- Breadcrumb changed from "Create Template" to "Edit Template" confirming upsert |
| 7 | Reload page -- verify data persisted | PASS -- All fields retained their values after full page reload |
| 8 | No console errors | PASS -- 0 errors across entire session |
| 9 | Re-save (update path) | PASS -- Changed name to "v2", saved, reloaded -- update persisted correctly |

## Live Preview Verification

The certificate preview panel on the right side of the form updates reactively as fields change:
- Template name appears as the certificate title
- Signer name and title appear in the signature area
- Issuer name shows in the issuer section
- Color preset changes are reflected in the preview borders/accents

## Architecture Assessment

**Context pattern:** Uses React 19 `createContext` + `use()` hook (not `useContext`). The `CertificateTemplateProvider` wraps all state, refs, and handlers into a single context value with `useMemo` for performance.

**Separation of concerns:** Each section file only imports `useCertificateTemplate()` from the context and renders its specific UI. No cross-section dependencies. The shell file orchestrates layout and submit buttons.

**Server action:** Clean `actionHandler` + ownership verification pattern consistent with other teacher actions in the codebase. The `onConflict` upsert on `(course_id, tenant_id)` handles both create and update paths without branching logic.

## Issues Found

None. All tests passed with zero console errors.
