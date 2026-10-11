# Student quality follow-up — October 11, 2026

## Confirmed issues repaired

1. Certificate generation selected `profiles.full_name, email`, but `profiles`
   has no email column. A local authenticated query reproduced Postgres error
   `42703`. The whole read failed and certificates defaulted to the name
   “Student”, even when a saved full name existed. Generation now selects only
   `full_name`, uses the verified auth email as a fallback, and refuses to issue
   a certificate if the profile read fails.
2. The profile's Manage Subscription control had no handler or destination.
   The browser regression failed before repair. It is now a link to student
   billing, verified by clicking it and checking navigation.
3. Profile certificate data was aliased to `course_certificates_templates`,
   while the certificate card reads `certificate_templates`. Corrected the
   property, replaced its undefined `cert.id` key with `certificate_id`, and
   excluded revoked certificates to match the dedicated certificate screen.
4. Certificate and progress pages discarded query errors and rendered empty
   lists or zero progress. They now reach the existing retry boundary. That
   boundary now uses existing English/Spanish translations and a generic page
   error title, rather than incorrectly saying every failure concerns courses.

## Scope and evidence

- Validated certificate-list, lesson-page and discussion-grade query shapes
  through the local test student's RLS client using zero-row requests. None
  returned a schema/relationship error.
- Visited profile, My Courses, Browse Courses, Progress, Certificates and
  Billing on desktop and 390px mobile. Both browser cases passed, each visiting
  all six screens, checking for error boundaries and uncaught JavaScript errors,
  and exercising the repaired subscription link when the active plan is shown.
- 16 focused unit tests passed: certificate naming and failed-read behavior,
  student-page query failures versus genuine empty states, profile update,
  and certificate credential evidence.
- Changed-file ESLint and `git diff --check` passed.
- Production build passed. The repository config skips type checking in builds.
- The original profile save/retry/reload suite previously passed in English
  and Spanish on desktop and mobile; see the profile verification report.
- Full-project type checking remains limited by the earlier 8 GB heap exhaustion.

These are targeted student-page checks, not an exhaustive certification of
checkout, lesson completion, exams, certificate issuance or every role. No
deployment, schema migration or external publication was performed.

## UI evidence

- [Profile before repair](../evidence/student-quality-2026-10-11/profile-before.png)
- [Profile after repair](../evidence/student-quality-2026-10-11/profile-desktop.png)
- [Mobile progress](../evidence/student-quality-2026-10-11/progress-mobile.png)
- [Desktop/mobile screenshots](../evidence/student-quality-2026-10-11)
- [Student-screen flow recording](../evidence/student-quality-2026-10-11/student-screens.gif)
