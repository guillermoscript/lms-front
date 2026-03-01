# Gamification System

Complete documentation for the LMS gamification feature: XP, levels, streaks, achievements, leaderboards, and a coin-based reward store.

## Table of Contents

- [Overview](#overview)
- [Database Schema](#database-schema)
- [SQL Functions (RPCs)](#sql-functions-rpcs)
- [Automatic XP Triggers](#automatic-xp-triggers)
- [Edge Functions](#edge-functions)
- [Frontend Architecture](#frontend-architecture)
- [Data Flows](#data-flows)
- [Seed Data](#seed-data)
- [Local Development](#local-development)

---

## Overview

The gamification system motivates students through:

- **XP (Experience Points)** — Earned automatically for learning activities
- **Levels (1–20)** — Progression based on total XP
- **Streaks** — Consecutive daily activity tracking
- **Achievements (30)** — Milestone badges across learning, social, streak, and progression categories
- **Coins** — Virtual currency derived from XP: `coins = floor(total_xp / 10) - total_coins_spent`
- **Store (6 items)** — Spend coins on power-ups and cosmetics
- **Leaderboard** — Cached top-1000 ranking by XP

### Key Design Decisions

- **Tenant-scoped**: All gamification data (XP, levels, streaks, achievements, store, leaderboard) is scoped per tenant. A user has separate progression per school.
- **Plan-gated features**: Advanced features are locked behind plan tiers (see [Plan-Gated Features](#plan-gated-features) below)
- **Automatic XP**: All XP is awarded via database triggers — no client-side logic needed
- **Lazy profile creation**: Gamification profiles are created on first XP award via UPSERT in `award_xp()`, not on user signup
- **SECURITY DEFINER**: All write operations go through `SECURITY DEFINER` functions; RLS handles reads
- **Lazy loading**: The dashboard header only fetches the summary; leaderboard/achievements/store load on demand
- **Edge Functions**: Complex reads (summary, leaderboard) and writes (spend-points, check-achievements) use Supabase Edge Functions with service role access
- **JWT handled internally**: Edge functions use `verify_jwt = false` in config and validate auth via `getUser()` — required because local auth issues ES256 tokens while the edge gateway expects HS256

### Plan-Gated Features

Features are gated by the tenant's `plan` column via `get_gamification_features()` RPC:

| Plan | XP | Levels | Streaks | Leaderboard | Achievements | Store | Custom Content |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **free** | Yes | Yes | Yes | No | No | No | No |
| **basic** | Yes | Yes | Yes | Yes | Yes | No | No |
| **professional** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **enterprise** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

When a feature is locked:
- Edge functions return `{ feature_locked: true }` (403 for leaderboard/store)
- Frontend components show upgrade prompts with lock icons
- The gamification header hides the trophy icon when achievements are disabled

---

## Database Schema

12 tables prefixed with `gamification_`:

### gamification_levels

Level definitions with XP thresholds.

| Column | Type | Description |
|--------|------|-------------|
| `level` | `INTEGER` (PK) | Level number (1–20) |
| `min_xp` | `INTEGER` | XP required to reach this level |
| `title` | `TEXT` | Display name (e.g., "Scholar", "Master") |
| `icon` | `TEXT` | Emoji icon |
| `perks` | `JSONB` | Level perks (future use) |

**RLS**: Anyone can SELECT.

### gamification_achievements

Achievement definitions. Global (platform default) when `tenant_id IS NULL`, school-specific when set.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` (PK) | |
| `slug` | `TEXT` (UNIQUE) | Machine name (e.g., `first_lesson`) |
| `title` | `TEXT` | Display name |
| `description` | `TEXT` | User-facing description |
| `tier` | `TEXT` | `bronze`, `silver`, `gold`, `platinum`, `diamond` |
| `category` | `TEXT` | `learning`, `assessment`, `social`, `streak`, `progression` |
| `icon` | `TEXT` | Emoji |
| `xp_reward` | `INTEGER` | XP bonus when earned |
| `coin_reward` | `INTEGER` | Coin bonus when earned |
| `condition_type` | `TEXT` | Stat key to check (e.g., `lessons_completed`) |
| `condition_value` | `INTEGER` | Threshold to trigger (e.g., `10`) |
| `is_active` | `BOOLEAN` | Soft-delete flag |
| `tenant_id` | `UUID` (NULLABLE, FK → tenants) | NULL = global, UUID = school-specific |

**RLS**: Anyone can SELECT where `is_active = true` AND (`tenant_id IS NULL` OR `tenant_id = get_tenant_id()`).

### gamification_profiles

Per-user, per-tenant gamification state. Created lazily by `award_xp()` on first XP award (UPSERT).

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` (PK) | |
| `user_id` | `UUID` (FK → profiles) | |
| `tenant_id` | `UUID` (NOT NULL, FK → tenants) | School scope |
| `total_xp` | `INTEGER` | Lifetime XP in this school |
| `level` | `INTEGER` (FK → levels) | Current level in this school |
| `current_streak` | `INTEGER` | Current consecutive days |
| `longest_streak` | `INTEGER` | All-time best streak |
| `streak_freezes_available` | `INTEGER` | Purchased streak freezes |
| `total_coins_spent` | `INTEGER` | Running total of coins spent |
| `last_activity_date` | `DATE` | Last date XP was earned |
| `updated_at` | `TIMESTAMPTZ` | |

**Constraint**: `UNIQUE(user_id, tenant_id)` — one profile per user per school.
**RLS**: Anyone in the same tenant can SELECT (needed for leaderboards).

### gamification_user_achievements

Join table: which users have earned which achievements, per tenant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` (PK) | |
| `user_id` | `UUID` (FK → profiles) | |
| `achievement_id` | `UUID` (FK → achievements) | |
| `tenant_id` | `UUID` (NOT NULL, FK → tenants) | School scope |
| `earned_at` | `TIMESTAMPTZ` | |

**Constraint**: `UNIQUE(user_id, achievement_id, tenant_id)`.
**RLS**: Same-tenant users can SELECT.

### gamification_xp_transactions

Audit log of all XP awards, scoped per tenant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` (PK) | |
| `user_id` | `UUID` (FK → profiles) | |
| `tenant_id` | `UUID` (NOT NULL, FK → tenants) | School scope |
| `action_type` | `TEXT` | e.g., `lesson_completion`, `exam_submission` |
| `xp_amount` | `INTEGER` | XP awarded |
| `reference_id` | `TEXT` | ID of the source entity |
| `reference_type` | `TEXT` | Type of source (e.g., `lesson`, `exam`) |
| `created_at` | `TIMESTAMPTZ` | |

**RLS**: Users can SELECT own rows within current tenant only.

### gamification_store_items

Items available for purchase with coins. Global (platform default) when `tenant_id IS NULL`, school-specific when set.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` (PK) | |
| `slug` | `TEXT` (UNIQUE) | Machine name |
| `name` | `TEXT` | Display name |
| `description` | `TEXT` | |
| `price_coins` | `INTEGER` | Cost in coins |
| `icon` | `TEXT` | Emoji |
| `category` | `TEXT` | `power_up`, `cosmetic`, `badge` |
| `max_per_user` | `INTEGER` | NULL = unlimited |
| `is_available` | `BOOLEAN` | Whether item is purchasable |
| `metadata` | `JSONB` | Extra data (e.g., duration for double XP) |
| `tenant_id` | `UUID` (NULLABLE, FK → tenants) | NULL = global, UUID = school-specific |

**RLS**: Anyone can SELECT where `is_available = true` AND (`tenant_id IS NULL` OR `tenant_id = get_tenant_id()`).

### gamification_redemptions

Purchase history, per tenant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` (PK) | |
| `user_id` | `UUID` (FK → profiles) | |
| `item_id` | `UUID` (FK → store_items) | |
| `tenant_id` | `UUID` (NOT NULL, FK → tenants) | School scope |
| `coins_spent` | `INTEGER` | |
| `redeemed_at` | `TIMESTAMPTZ` | |

**RLS**: Users can SELECT own rows within current tenant only.

### gamification_user_rewards

Active power-ups and cosmetics (e.g., double XP buff), per tenant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` (PK) | |
| `user_id` | `UUID` (FK → profiles) | |
| `tenant_id` | `UUID` (NOT NULL, FK → tenants) | School scope |
| `reward_type` | `TEXT` | e.g., `double_xp`, `streak_freeze` |
| `reward_data` | `JSONB` | e.g., `{"item_name": "Double XP (1h)"}` |
| `expires_at` | `TIMESTAMPTZ` | NULL = permanent |
| `is_active` | `BOOLEAN` | |

**RLS**: Users can SELECT own rows within current tenant only.

### gamification_leaderboard_cache

Pre-computed per-tenant leaderboard for fast reads.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` (PK) | |
| `user_id` | `UUID` (FK → profiles) | |
| `tenant_id` | `UUID` (NOT NULL, FK → tenants) | School scope |
| `full_name` | `TEXT` | Denormalized from profiles |
| `avatar_url` | `TEXT` | Denormalized from profiles |
| `total_xp` | `INTEGER` | |
| `level` | `INTEGER` | |
| `rank` | `INTEGER` | 1-based position within tenant |
| `updated_at` | `TIMESTAMPTZ` | |

**Constraint**: `UNIQUE(user_id, tenant_id)`.
**RLS**: Same-tenant users can SELECT.

### gamification_challenge_participants

Tracks user participation in challenges, per tenant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` (PK) | |
| `user_id` | `UUID` (FK → profiles) | |
| `tenant_id` | `UUID` (NOT NULL, FK → tenants) | School scope |
| `challenge_id` | `UUID` | |
| `completed_at` | `TIMESTAMPTZ` | NULL if not yet completed |

**Constraint**: `UNIQUE(user_id, challenge_id)`.
**RLS**: Users can SELECT own rows within current tenant only.

---

## SQL Functions (RPCs)

### `award_xp(_user_id, _action_type, _xp_amount, _reference_id?, _reference_type?, _tenant_id?)`

Core function that:

1. Resolves `tenant_id` (from param, JWT, or default tenant)
2. UPSERTs a `gamification_profiles` row keyed on `(user_id, tenant_id)` — creates profile lazily on first XP award
3. Inserts a tenant-scoped `xp_transactions` record
4. Updates streak (continues if yesterday, resets otherwise)
5. Adds XP to `gamification_profiles.total_xp`
6. Auto-levels up by checking `gamification_levels`

**Security**: `SECURITY DEFINER` — called by triggers, not directly by users.

### `refresh_leaderboard_cache()`

Truncates and rebuilds the leaderboard cache from `gamification_profiles` joined with `profiles`. Uses `PARTITION BY tenant_id` for per-school rankings, top 1000 per tenant.

**Security**: `SECURITY DEFINER`.

### `get_gamification_features(_tenant_id)`

Returns a JSONB object with feature flags based on the tenant's `plan`:

```json
// free:         {"xp":true,"levels":true,"streaks":true,"leaderboard":false,"achievements":false,"store":false,...}
// basic:        {"xp":true,"levels":true,"streaks":true,"leaderboard":true,"achievements":true,"store":false,...}
// professional: {"xp":true,"levels":true,"streaks":true,"leaderboard":true,"achievements":true,"store":true,"custom_achievements":true,"custom_store":true}
```

**Security**: `SECURITY DEFINER`.

### `get_completed_courses_count(_user_id)`

Returns count of courses where all published lessons are completed by the user. Used by `check-achievements` edge function.

### `get_likes_received_count(_user_id)`

Returns count of `like` reactions on the user's lesson comments. Used by `check-achievements` edge function.

---

## Automatic XP Triggers

XP is awarded automatically when students complete learning activities:

| Trigger | Table | Event | XP | tenant_id Source |
|---------|-------|-------|-----|-----------------|
| `on_lesson_completed_xp` | `lesson_completions` | INSERT | 100 | `NEW.tenant_id` (direct) |
| `on_exam_submitted_xp` | `exam_submissions` | INSERT (when score IS NOT NULL) | 200–300 | `NEW.tenant_id` (direct) |
| `on_exam_score_updated_xp` | `exam_submissions` | UPDATE (score NULL → NOT NULL) | 200–300 | `NEW.tenant_id` (direct) |
| `on_exercise_completed_xp` | `exercise_completions` | INSERT | 50 | Lookup via `exercises.tenant_id` |
| `on_comment_posted_xp` | `lesson_comments` | INSERT | 10 | Lookup via `lessons.tenant_id` |
| `on_review_posted_xp` | `reviews` | INSERT | 50 | Lookup via `courses.tenant_id` |

All trigger functions are `SECURITY DEFINER` and call `award_xp(_tenant_id := v_tenant_id)` internally.

> **Note:** The `on_profile_created_gamification` trigger was **removed**. Gamification profiles are now created lazily by `award_xp()` via UPSERT on first XP award per tenant.

---

## Edge Functions

Located in `supabase/functions/`. All functions:

- Use Deno runtime with `@supabase/supabase-js@2` from esm.sh
- Share CORS headers from `_shared/cors.ts`
- Validate auth via `getUser()` (not gateway JWT)
- Have `verify_jwt = false` in `supabase/config.toml`

### `get-gamification-summary`

**Purpose**: Returns the complete gamification state for the authenticated user **within the current tenant**.

**Method**: POST
**Auth**: Bearer token required (tenant_id extracted from JWT)
**Body**: `{ "user_id"?: string }` (optional, defaults to authenticated user)

**Tenant scoping**: Extracts `tenant_id` from JWT claims. All queries filter by `(user_id, tenant_id)`.

**Response**:
```json
{
  "total_xp": 1250,
  "level": 5,
  "level_title": "Apprentice",
  "level_icon": "🔨",
  "xp_progress": {
    "current": 400,
    "required": 450,
    "percentage": 89
  },
  "streak": {
    "current": 3,
    "longest": 7,
    "freezes_available": 1,
    "last_activity": "2026-02-15"
  },
  "coins": 75,
  "achievements": {
    "earned": 4,
    "total": 30,
    "recent": [...],
    "newly_earned": []
  },
  "recent_xp": [...],
  "features": {
    "xp": true,
    "levels": true,
    "streaks": true,
    "leaderboard": true,
    "achievements": true,
    "store": false,
    "custom_achievements": false,
    "custom_store": false
  }
}
```

**Coins calculation**: `floor(total_xp / 10) - total_coins_spent`

### `get-leaderboard`

**Purpose**: Returns the tenant-scoped leaderboard with the current user's rank.

**Method**: POST
**Auth**: Bearer token required (tenant_id extracted from JWT)
**Body**: `{ "limit"?: number }` (default 10)

**Plan gate**: Returns `{ feature_locked: true }` with 403 if leaderboard is not available on the tenant's plan.

**Response**:
```json
{
  "leaderboard": [
    { "rank": 1, "user_id": "...", "full_name": "Alice", "xp": 5000, "level": 10, "current_streak": 14 }
  ],
  "user_rank": { "rank": 42, "total_xp": 1250, "level": 5 },
  "total_players": 150
}
```

### `check-achievements`

**Purpose**: Evaluates all unearned achievements against the user's current stats **within the current tenant**. Awards any newly earned achievements and their XP bonuses.

**Method**: POST
**Auth**: Bearer token required (tenant_id extracted from JWT)
**Body**: `{ "user_id"?: string }`

**Plan gate**: Returns `{ feature_locked: true, newly_earned: [], count: 0 }` if achievements are not available on the tenant's plan.

**Stats evaluated** (all filtered by tenant_id):
- `lessons_completed`, `exams_submitted`, `perfect_exams`
- `exercises_completed`, `exercises_high_score` (score ≥ 80)
- `comments_posted`, `likes_received`, `reviews_written`
- `courses_completed`, `lessons_in_day`
- `avg_exam_score`, `streak_days`, `level_reached`, `total_xp`
- `challenges_won`

**Response**:
```json
{
  "newly_earned": ["first_lesson", "vocal_student"],
  "count": 2
}
```

### `spend-points`

**Purpose**: Purchases a store item with coins within the current tenant context.

**Method**: POST
**Auth**: Bearer token required (tenant_id extracted from JWT)
**Body**: `{ "item_id": "uuid" }`

**Plan gate**: Returns `{ error: "Store feature not available on your plan", feature_locked: true }` with 403 if store is not available.

**Logic**:
1. Checks plan allows store access
2. Verifies item exists and `is_available = true` (shows global + tenant-specific items)
3. Checks user has enough coins (tenant-scoped balance)
4. Checks `max_per_user` limit within tenant
5. Creates tenant-scoped `redemption` record
6. Updates `total_coins_spent` on tenant-scoped profile
7. Creates tenant-scoped `user_reward` (with `expires_at` for time-limited items)

**Response**:
```json
{
  "success": true,
  "reward": { "id": "...", "reward_type": "double_xp", "expires_at": "..." },
  "remaining_coins": 250
}
```

---

## Frontend Architecture

### Hook: `lib/hooks/use-gamification.ts`

Central state manager for all gamification data. Uses Zustand-like pattern with React state.

**Exports**:
- Types: `GamificationSummary`, `GamificationFeatures`, `LeaderboardEntry`, `Achievement`, `StoreItem`
- Hook: `useGamification()` returns:
  - `summary` — Main gamification state (auto-fetched on mount)
  - `leaderboard` — Top players (fetched on demand)
  - `achievements` — All achievements with earned status (fetched on demand)
  - `storeItems` — Available store items (fetched on demand)
  - `loading` / `error` — State flags
  - `refreshSummary()` — Re-fetch summary
  - `refreshLeaderboard()` — Fetch leaderboard
  - `refreshAchievements()` — Fetch achievements
  - `refreshStore()` — Fetch store items
  - `purchaseItem(itemId)` — Buy a store item

**Loading strategy**: Only `fetchSummary()` runs in the `useEffect`. Components that need leaderboard/achievements/store call the refresh functions in their own `useEffect`.

### Components: `components/gamification/`

| Component | Description | Used In |
|-----------|-------------|---------|
| `gamification-header-card.tsx` | XP bar, level, streak, coins in dashboard header | Dashboard layout |
| `xp-progress-circle.tsx` | Circular SVG progress indicator | Profile page |
| `streak-calendar.tsx` | Visual streak calendar | Profile page |
| `profile-stats.tsx` | Detailed gamification stats | Profile page |
| `achievement-grid.tsx` | Grid of all achievements (earned/locked) | Profile page, store page |
| `mini-leaderboard.tsx` | Top-5 sidebar leaderboard | Student dashboard |
| `store-section.tsx` | Store items container | Store page |
| `point-store-item.tsx` | Individual store item card | Store section |

### Pages

| Page | Path | Gamification Features |
|------|------|----------------------|
| Student Dashboard | `app/[locale]/dashboard/student/page.tsx` | Mini leaderboard in sidebar |
| Student Profile | `app/[locale]/dashboard/student/profile/page.tsx` | XP circle, stats, streak, achievements |
| Reward Store | `app/[locale]/dashboard/student/store/page.tsx` | Store items, achievement grid |
| Dashboard Layout | `app/[locale]/dashboard/layout.tsx` | Header card (XP bar, level) |

---

## Data Flows

### XP Award Flow

```
Student completes lesson
    → INSERT INTO lesson_completions (with tenant_id)
    → TRIGGER: on_lesson_completed_xp()
        → Resolve tenant_id from NEW.tenant_id
        → award_xp(user_id, 'lesson_completion', 100, lesson_id, 'lesson', tenant_id)
            → UPSERT gamification_profiles (user_id, tenant_id) — creates if first XP
            → INSERT xp_transaction (with tenant_id)
            → UPDATE streak
            → UPDATE total_xp
            → CHECK level up
```

### Achievement Check Flow

```
Frontend calls check-achievements edge function
    → Gathers stats from: lesson_completions, exam_submissions,
      exercise_completions, lesson_comments, comment_reactions,
      reviews, gamification_profiles, gamification_challenge_participants
    → Compares each unearned achievement's condition_type/condition_value
    → Awards matching achievements + XP bonuses via award_xp()
    → Returns newly earned achievement slugs
```

### Store Purchase Flow

```
User clicks "Buy" on store item
    → Frontend calls purchaseItem(itemId) from hook
    → Hook calls spend-points edge function
        → Validates: item available, sufficient coins, within max_per_user
        → INSERT gamification_redemptions
        → UPDATE gamification_profiles.total_coins_spent
        → INSERT gamification_user_rewards (with optional expires_at)
    → Hook refreshes summary (coins update)
```

### Leaderboard Refresh Flow

```
refresh_leaderboard_cache() (called periodically or manually)
    → TRUNCATE gamification_leaderboard_cache
    → INSERT from gamification_profiles JOIN profiles
    → ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY total_xp DESC)
    → Top 1000 per tenant
```

---

## Seed Data

### Levels (20)

| Level | Title | Min XP |
|-------|-------|--------|
| 1 | Newcomer | 0 |
| 2 | Seeker | 100 |
| 3 | Learner | 250 |
| 4 | Scholar | 500 |
| 5 | Apprentice | 850 |
| 6 | Novice | 1,300 |
| 7 | Student | 1,900 |
| 8 | Practitioner | 2,600 |
| 9 | Specialist | 3,400 |
| 10 | Adept | 4,300 |
| 11 | Professional | 5,400 |
| 12 | Expert | 6,700 |
| 13 | Scholar-Elite | 8,200 |
| 14 | Master | 10,000 |
| 15 | Grandmaster | 12,500 |
| 16 | Sage | 15,500 |
| 17 | Oracle | 19,000 |
| 18 | Legend | 23,000 |
| 19 | Mythic | 28,000 |
| 20 | Transcendent | 35,000 |

### Achievements (10 seeded, 30 slots planned)

| Slug | Title | Tier | Category | Condition | XP Reward |
|------|-------|------|----------|-----------|-----------|
| `first_lesson` | First Steps | Bronze | Learning | 1 lesson completed | 50 |
| `lesson_enthusiast` | Knowledge Seeker | Silver | Learning | 10 lessons | 200 |
| `lesson_master` | Scholar of the Year | Gold | Learning | 50 lessons | 1,000 |
| `first_perfect_exam` | Perfectionist | Silver | Assessment | 1 perfect exam | 300 |
| `exam_veteran` | Battle Tested | Silver | Assessment | 10 exams | 500 |
| `exercise_wizard` | Practice Makes Perfect | Gold | Assessment | 25 exercises | 750 |
| `vocal_student` | Voice of Reason | Bronze | Social | 1 comment | 50 |
| `helpful_peer` | Top Contributor | Silver | Social | 10 likes received | 400 |
| `reviewer` | Critical Thinker | Bronze | Social | 5 reviews | 150 |
| `week_streak` | Consistency is Key | Silver | Streak | 7-day streak | 500 |
| `month_streak` | Unstoppable | Gold | Streak | 30-day streak | 2,000 |
| `level_10` | Double Digits | Silver | Progression | Reach level 10 | 500 |

### Store Items (6)

| Slug | Name | Category | Price | Max/User |
|------|------|----------|-------|----------|
| `streak_freeze` | Streak Freeze | power_up | 500 | 5 |
| `double_xp_1h` | Double XP (1h) | power_up | 1,000 | — |
| `hint_token` | Hint Token | power_up | 200 | — |
| `early_access` | Course Early Access | power_up | 5,000 | 1 |
| `custom_avatar_frame` | Golden Frame | cosmetic | 2,500 | 1 |
| `vip_badge` | VIP Supporter | cosmetic | 10,000 | 1 |

---

## Local Development

### Prerequisites

```bash
supabase start          # Start local Supabase (includes DB, Auth, Storage)
supabase db push        # Apply migrations (creates gamification tables)
```

### Running Edge Functions

```bash
supabase functions serve --no-verify-jwt
```

The `--no-verify-jwt` flag is needed because local auth issues ES256 tokens but the edge gateway expects HS256. Each function validates auth internally via `getUser()`.

Alternatively, `verify_jwt = false` is set per-function in `supabase/config.toml`:

```toml
[functions.get-gamification-summary]
verify_jwt = false

[functions.get-leaderboard]
verify_jwt = false

[functions.check-achievements]
verify_jwt = false

[functions.spend-points]
verify_jwt = false
```

### Testing Edge Functions

```bash
# Get a valid token
TOKEN=$(curl -s http://127.0.0.1:54321/auth/v1/token?grant_type=password \
  -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"email":"student@test.com","password":"password123"}' | jq -r '.access_token')

# Call a function
curl -s http://127.0.0.1:54321/functions/v1/get-gamification-summary \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

### Migration Files

| File | Description |
|------|-------------|
| `20260216000000_create_gamification_system.sql` | Tables, RPCs, triggers |
| `20260216000001_seed_gamification_data.sql` | Levels, achievements, store items |
| `20260215000003_schedule_leaderboard_refresh.sql` | Leaderboard refresh scheduling |
| `20260217030000_tenant_scope_gamification.sql` | Tenant-scoping, plan-gated features, RLS updates |

---

## i18n Keys

Gamification-related translations are in `messages/{locale}.json` under:

- `components.gamification` — Header card, leaderboard, achievements, store
- `dashboard.student.profile` — Profile page gamification section
- `dashboard.student.store` — Store page

Key namespaces:
```
components.gamification.headerCard.*     — XP bar, level, streak, coins
components.gamification.leaderboard.*    — Mini leaderboard
components.gamification.achievements.*   — Achievement grid
components.gamification.store.*          — Store section and items
components.gamification.upgrade.*        — Plan upgrade prompts (leaderboardLocked, achievementsLocked, storeLocked)
```
