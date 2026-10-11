# Remaining student flows — October 11, 2026

## Confirmed fixes

- Lesson completion celebrated XP and course completion before the database insert. The browser regression reproduced success and error messages together on a failed write. Celebrations and analytics now follow a successful save. Expired sessions show an error and lead to login; unexpected failures release the loading state.
- The mobile lesson error toast covered the Complete button. A normal Playwright retry click was blocked by the toast. Lesson-save errors now appear at the top; desktop and mobile retry clicks pass without forced clicks.
- Flashcard ratings reported success even when the scoped update affected no rows. The shared core query now requests the saved row and rejects a missing row. The review UI catches exceptions and always releases its saving state, keeping the current card available after failure.
- Artifact, recording and conversation evaluations ignored failed completion writes. These routes now return HTTP 500 when saving the result, evaluation or completion fails, rather than report a pass. Media and conversation attempts return to pending on handled database failures so the existing attempt can be retried.
- The exercise list hid a query failure behind an empty list. The exam list turned a query failure into a 404. Both now reach the existing course error boundary with retry.
- Lesson certificate notifications exclude revoked credentials.

## Validation

- 46 focused unit tests passed: profile save, certificate naming, failed student-page queries versus genuine empty lists, review scheduling and zero-row saves, and exercise persistence failures and successful results.
- Exercise regression tests first reproduced six false-success failures across the three routes. The review zero-row regression also failed before repair.
- Four browser cases initially passed, then passed again after Docker/database recovery: desktop and 390px mobile, each visiting profile, courses, browse, progress, certificates, billing, reviews, the enrolled course's exercise list and exam list; subscription navigation; and failed lesson-save retries with no success toast.
- Four additional profile browser cases passed after recovery, saving all profile fields, checking persistence after reload and restoring the original profile.
- Browser lesson writes were intercepted with HTTP 503. Tests did not change lesson progress, submit exams, spend AI credits or delete fixtures.
- Changed-file ESLint, diff whitespace checks and the core package TypeScript check passed.
- Production build passed after clearing the regenerable development cache following an ENOSPC disk-space failure. The local development server was restarted. The repository build explicitly skips TypeScript checks. The earlier full-project type check exhausted its configured 8 GB heap; a full-project type-check pass is not claimed.

## Local environment follow-up

After the disk-full incident, the optional screenshot rerun could no longer log in. Supabase Auth health returned HTTP 200, while the database API returned HTTP 503 with PGRST002 (schema cache unavailable). Docker VM logs showed vda1 write I/O errors. Clearing the Next.js cache recovered approximately 9 GB of host disk space, and the production build passed, and Docker Desktop was restarted with explicit user approval. Its CLI restart and graceful shutdown stalled; reopening after closing the stuck backend started a fresh VM. Supabase Auth and the database API both returned HTTP 200, and all local Supabase containers became healthy. All eight browser cases passed against the recovered database in 1.1 minutes: profile save/failure/retry/reload in English and Spanish on desktop and mobile, nine student-screen checks on each viewport, and lesson error retries on each viewport. Profile tests restored the original test profile after saving. No database reset or fixture deletion was attempted.

These checks cover the identified failures and student screen navigation. Live paid AI evaluation, microphone/camera workflows and actual exam submission were reviewed in code but were not exercised end to end here. No deployment, migration or external publication was performed.

## Evidence

Saved in `docs/evidence/student-remaining-2026-10-11/`: lesson false-success before screenshot, desktop/mobile lesson retry screenshots, review/exam/exercise list screenshots, and a mobile lesson-retry GIF/video.
