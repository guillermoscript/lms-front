# Gamification E2E Test Specification

Source of truth for gamification feature E2E tests. Covers store, achievements, leaderboard, XP display, streak calendar, and profile stats.

## Test Accounts

| Account | Email | Tenant | Role |
|---------|-------|--------|------|
| Default Student | `student@e2etest.com` | Default (lvh.me:3000) | student |
| Tenant Student | `alice@student.com` | Code Academy (code-academy.lvh.me:3000) | student |

Password for all: `password123`

## Feature Context

- Gamification components are client-side, driven by `useGamificationSummary()` hook
- Features are gated: store, achievements, leaderboard may show "locked" upgrade prompt
- Key gamification components render on student dashboard and store page
- Store page has `data-testid="store-page"` on its container
- No `data-testid` attributes exist on gamification components; use text/role/structure selectors
- Store items use `usePointStore()` hook; achievements use `useAchievements()` hook
- Leaderboard uses `useLeaderboard()` hook
- The `GamificationHeaderCard` appears in the student dashboard layout (level, streak, coins)

---

## 1. Store Page

**File:** `gamification.spec.ts`
**Route:** `/en/dashboard/student/store`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 1.1 | Store page container visible | `[data-testid="store-page"]` | testid |
| 1.2 | Store heading (h1) visible | `h1` | role |
| 1.3 | Store section renders (items grid or empty state or locked state) | Grid with items, empty message, or lock icon | component |
| 1.4 | If store is available, balance display shows coin count | Text containing "Balance" or coin amount | text |

---

## 2. XP and Level Display (Student Dashboard)

**File:** `gamification.spec.ts`
**Route:** `/en/dashboard/student`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 2.1 | Student dashboard loads | `[data-testid="student-dashboard"]` | testid |
| 2.2 | Gamification header card renders (level indicator or loading skeleton) | Element containing "Lvl" text or level number | text |
| 2.3 | Mini leaderboard renders on dashboard (title or locked state) | Text containing leaderboard title or lock icon | text / component |

---

## 3. Achievement Grid

**File:** `gamification.spec.ts`
**Route:** `/en/dashboard/student/store` (or profile page if achievements are shown there)

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 3.1 | Achievement grid renders (cards or locked state) | Grid of achievement cards or locked upgrade prompt | component |
| 3.2 | Achievement cards show tier labels (bronze/silver/gold/platinum) or locked message | Text with tier or locked text | text |

---

## 4. Leaderboard

**File:** `gamification.spec.ts`
**Route:** `/en/dashboard/student`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 4.1 | Leaderboard section renders on student dashboard | Leaderboard title text or locked state | text |
| 4.2 | Leaderboard shows user entries or empty state | User names/XP values or "No entries" message | text / component |

---

## 5. Streak Calendar

**File:** `gamification.spec.ts`
**Route:** `/en/dashboard/student` (if rendered) or store page

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 5.1 | Streak calendar renders (7-day grid with day labels) | Day abbreviation letters (M, T, W, etc.) | text |
| 5.2 | Streak count visible | Numeric streak count | text |

---

## 6. Profile Gamification Stats

**File:** `gamification.spec.ts`
**Route:** `/en/dashboard/student/profile`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 6.1 | Profile page loads | `[data-testid="profile-page"]` | testid |
| 6.2 | Gamification stats section renders (coins and streak indicators) | Text containing "Coins" and "Streak" labels | text |

---

## 7. Cross-Tenant Gamification

**File:** `gamification.spec.ts`
**Route:** `/en/dashboard/student/store` on Code Academy tenant

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 7.1 | Tenant student store page loads | `[data-testid="store-page"]` | testid |

---

## Notes

- Tests do NOT purchase store items or redeem rewards to avoid data pollution
- Gamification features may be locked depending on tenant plan; tests handle both unlocked and locked states
- Components use `useGamificationSummary()` which may return null during loading; tests wait for content
- `GamificationHeaderCard` is compact and may have different layouts on mobile vs desktop
