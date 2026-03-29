# Certificate Verification E2E Test Specification

Source of truth for public certificate verification page tests.

## Test Accounts

No login required -- verification pages are public.

## Seeded Data

- Certificate is either found from existing DB data or seeded in `beforeAll`
- If seeded: template `[E2E] Test Template`, certificate on course 1001, student `a1000000-...0001`
- Verification code format: `E2E-{timestamp}-{random}`

---

## 1. Invalid Certificate Verification

**File:** `certificate-verification.spec.ts`
**Route:** `/en/verify/INVALID-CODE-12345`

| # | Assertion | Selector / Method | Type |
|---|-----------|-------------------|------|
| 1.1 | Shows "not found" message | body text matches not found / invalid | text |
| 1.2 | Has return home button | `a[href="/"]` | locator |

---

## 2. Valid Certificate Verification

**File:** `certificate-verification.spec.ts`
**Route:** `/en/verify/{code}` (code from DB)

| # | Assertion | Selector / Method | Type |
|---|-----------|-------------------|------|
| 2.1 | Shows verified credential (not "not found") | body text does not match "not found" | text |
| 2.2 | Shows student name in heading | `h1` visible with non-empty text | role |
| 2.3 | Shows verification code on page | body text contains verification code | text |

---

## Cleanup

- Seeded certificate deleted in `afterAll` (only if we created it)
- Seeded `[E2E] Test Template` deleted in `afterAll`
