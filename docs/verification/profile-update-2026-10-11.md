# Profile update verification — October 11, 2026

## Root cause

The student profile read selected `*, user_roles(role)` from `profiles`.
`user_roles` references `auth.users`, and PostgREST has no relationship to embed
from `profiles`. A query against the local test account reproduced `PGRST200`:
“Could not find a relationship between 'profiles' and 'user_roles' in the schema cache”.
The page ignored the query error and rendered a null profile, so a successful
save appeared to do nothing and the next page load showed empty fields again.

The page now reads the profile directly through the authenticated RLS client,
gets the school role through `getUserRole`, and surfaces failed profile reads
through the existing route error boundary.

## Related repairs

- Profile UPDATE now requests the affected row and refuses to report success
  when RLS or a missing profile matches no rows.
- Profile and milestone-preference saves revalidate the actual localized routes.
- Profile submission no longer uses a client form action that resolves before
  its nested transition finishes and resets uncontrolled fields. Save failures
  preserve the draft; success and error feedback appears beside Save.
- Teacher account settings reuse this same profile form and save action.
- Branding, general, email, enrollment, payment and notification forms caught
  failures inside client form actions, which React treats as completed actions
  and resets. They now use normal submit handlers to preserve drafts. Notification
  creation still explicitly clears the form after success.
- Repository search found no other embedded `user_roles(...)` queries.

## Verification

- 25 focused unit tests passed: profile update, community milestones, general settings.
- Four Playwright cases passed: English and Spanish, desktop and 390px mobile.
  Each filled name, username, website and bio; simulated an HTTP 503 for the save;
  confirmed the draft survived; retried; checked the updated profile card;
  reloaded; checked all persisted fields; restored the test account's original
  values and verified restoration.
- ESLint passed for all changed source and test files. `git diff --check` passed.
- `npm run build` passed after allowing Turbopack's local worker port outside
  the sandbox. This repository configures builds to skip type checking.
- `npm run typecheck` exhausted its configured 8 GB JavaScript heap, so full
  type verification remains incomplete.

## Visual evidence

- [Broken profile read](../evidence/profile-update-2026-10-11/broken-profile-read.png)
  was captured while the broken read was still present, after the form-handler
  repair. An untouched before capture was unavailable because the initial
  localhost login could not retain cookies configured for lvh.me.
- [English desktop](../evidence/profile-update-2026-10-11/profile-en-desktop.png)
- [Spanish desktop](../evidence/profile-update-2026-10-11/profile-es-desktop.png)
- [English mobile](../evidence/profile-update-2026-10-11/profile-en-mobile.png)
- [Spanish mobile](../evidence/profile-update-2026-10-11/profile-es-mobile.png)
- [Save failure, retry and persistence recording](../evidence/profile-update-2026-10-11/profile-save-recovery.gif)
- [Original recording](../evidence/profile-update-2026-10-11/profile-save-recovery.webm)

No schema migration, deployment, commit or external publication was performed.
