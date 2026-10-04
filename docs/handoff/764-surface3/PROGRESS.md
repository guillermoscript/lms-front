# Surface 3 sweep — final state

`base` is `tests/unit/palette-class-baseline.json` on `master` (f52bcafc); `now` is the branch.
Every group was swept, adversarially verified and repaired, then a cross-group audit (16 lenses →
skeptic per group → fix → recheck) closed the loop. `lib/payments/payment-request-status.ts` is new
(A3-2) and counts 0 / 0.

| group | files | base palette/raw | now palette/raw | state |
|---|---|---|---|---|
| `A1-money` | 5 | 132 / 1 | 0 / 0 | done, audited |
| `O1-wizard` | 3 | 99 / 21 | 0 / 0 | done, audited |
| `O2-create-school` | 2 | 69 / 12 | 0 / 0 | done, audited |
| `A2-commerce` | 7 | 87 / 0 | 0 / 0 | done, audited |
| `A4-billing-users` | 11 | 72 / 3 | 0 / 0 | done, audited |
| `A3-payments` | 9 | 35 / 2 | 0 / 1 | done, audited |
| `A5-landing` | 2 | 31 / 0 | 0 / 0 | done, audited |
| `T2-grading` | 6 | 91 / 2 | 0 / 0 | done, audited |
| `T5-builders` | 12 | 63 / 30 | 0 / 13 | done, audited |
| `T6-certificates` | 8 | 43 / 5 | 14 / 3 | done, audited |
| `T1-block-editor` | 11 | 142 / 3 | 8 / 2 | done, audited |
| `T3-routes` | 8 | 128 / 2 | 0 / 0 | done, audited |
| `T4-versioning` | 6 | 90 / 13 | 0 / 0 | done, audited |
| **total** | 90 | **1082 / 94** | **22 / 19** | |

The remaining counts are the six Part 3 keeps; the baseline dropped 83 of 89 entries.

## Checks

- `npm run typecheck`, `npm run test:unit` (1,476 tests), `npm run build`: pass
- `lint-compare.mjs master`: no file got worse
- axe `color-contrast` over 204 screen × kit × mode combinations: **434 → 312**

## What is left (follow-ups, not this PR)

- `text-muted-foreground/60` and `/70` at 10–11px fail AA on dark cards; they are ~200 of the 312
  remaining violations and live in files outside the sweep too (student, platform).
- Light `--muted-foreground` sits at 4.32–4.39:1 on `bg-brand-tint` / `bg-muted` (D9 works around it).
- Decision conflicts raised by the audit: T1-5 text chip on the tinted fill-in-the-blank card; O1-3
  revenue tiles vs A1-2/T3-2 (success vs brand tint for the same shape).
- Named in DECISIONS: T3-3, T3-7, T6-1, O2-1, O2-3, certificate hex fallbacks, Button/Input dark fills.
- Shared banners still on palette colours: `limit-reached-banner`, `access-cutoff-banner`,
  `verify-email-banner`, `tenant-switcher`, notification bell/list.
