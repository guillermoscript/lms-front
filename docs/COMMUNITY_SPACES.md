# Community Spaces

Community Spaces adds a school-wide social feed and per-course discussion feeds to the LMS, deeply integrated with the existing multi-tenant architecture, gamification system, and role-based access control.

## Overview

- **School Feed** — visible to all tenant members, post updates and discussions
- **Course Feed** — scoped to enrolled students + teachers of that course
- **Post Types** — standard posts, discussion prompts (teacher/admin), polls, milestones (written by the database when a student completes a course, earns a certificate, levels up or keeps a streak — see [Milestone posts](#milestone-posts-871))
- **Reactions** — like, helpful, insightful, fire (with optimistic UI updates)
- **Threaded Comments** — nested replies up to 5 levels deep
- **Moderation** — pin, lock, hide posts; mute users; review flagged content
- **Feature Gate** — requires `starter` plan or higher (`community: 'starter'` in `FEATURE_REQUIRED_PLAN`)
- **Guided Tour** — 5-step tour for students, 6-step for admins (includes moderation)

## Architecture

### Database Tables (8 tables)

| Table | Purpose |
|-------|---------|
| `community_posts` | Core posts — school-level (`course_id NULL`) or course-scoped |
| `community_comments` | Threaded comments with `parent_comment_id` self-reference |
| `community_reactions` | Polymorphic reactions on posts or comments (like/helpful/insightful/fire) |
| `community_poll_options` | Poll answer choices linked to poll-type posts |
| `community_poll_votes` | One vote per user per poll (unique constraint) |
| `community_user_mutes` | Admin-managed mutes with optional expiration |
| `community_flags` | Content reports with pending/reviewed/dismissed workflow |
| `community_user_blocks` | A member hides another member's posts and comments from themselves. Global (no `tenant_id`), private to the blocker |

### Migrations

```
supabase/migrations/20260314200000_create_community_tables.sql     # Tables, indexes, triggers, RLS, storage
supabase/migrations/20260314210000_community_security_fixes.sql    # Hardened triggers, storage policies, flag dedup
supabase/migrations/20260314220000_community_edge_case_fixes.sql   # Self-reply constraint, depth limit, enrollment RLS
supabase/migrations/20260924160000_community_rules_in_db.sql       # #846: every write rule in RLS, vote_count trigger, blocks, hardened reports
supabase/migrations/20260928120000_community_milestone_posts.sql   # #871: milestone writer + source triggers, profiles.share_milestones, milestone RLS
```

### Triggers

| Trigger | Table | Purpose |
|---------|-------|---------|
| `set_community_posts_updated_at` | `community_posts` | Auto-update `updated_at` |
| `set_community_comments_updated_at` | `community_comments` | Auto-update `updated_at` |
| `trg_community_comment_count` | `community_comments` | Increment/decrement `community_posts.comment_count` |
| `trg_community_reaction_count` | `community_reactions` | Increment/decrement `community_posts.reaction_count` |
| `trg_check_comment_depth` | `community_comments` | Reject comments nested deeper than 5 levels |
| `trg_community_poll_vote_count` | `community_poll_votes` | Increment/decrement `community_poll_options.vote_count` — never write it by hand |
| `on_lesson_completed_community_milestone` | `lesson_completions` | #871: the lesson may complete its course → `course_completion` milestone |
| `on_exam_score_community_milestone` | `exam_scores` | #871: the score may complete its course → `course_completion` milestone |
| `on_certificate_issued_community_milestone` | `certificates` | #871: an eligible certificate → `certificate` milestone, or folded into a same-transaction completion post |
| `on_gamification_progress_community_milestone` | `gamification_profiles` | #871: level 5+ → `level_up`; 7/30/100-day streak → `streak` (school feed) |
| `on_course_deleted_community_milestones` | `courses` (BEFORE DELETE) | #871: a deleted course takes its milestone posts with it |

### RLS Policies

All tables have RLS enabled with tenant-scoped policies using `get_tenant_id()`, `get_tenant_role()`, and `auth.uid()`.

**The database is the authority (#846).** The native app writes posts, comments, reactions, votes, reports and blocks straight through RLS, so every rule the web actions check is also a policy. The actions keep their checks for the friendly error message; they write with the service role, which bypasses RLS.

**Key access rules:**
- **Every write** (post, comment, reaction, vote) requires `community_can_write(tenant_id)`: the JWT tenant, a plan with `features.community`, and no active mute
- **Posts SELECT**: school-level visible to all tenant members; course posts require enrollment or teacher/admin role. A post by an author the viewer blocked is hidden (restrictive policy; teachers and admins are exempt)
- **Posts INSERT**: author = caller; never pinned, locked, hidden or with non-zero counters. Students: only `standard` / `poll` (polls only if `community_student_polls` is on), never graded. School feed needs `community_student_posts_school_feed` on for students; a course post needs a course of this tenant and `has_course_access` (staff always). A lesson must belong to the course
- **Milestones are system posts (#871)**: a restrictive policy refuses `post_type = 'milestone'` or any `milestone_*` column from everyone, staff included; only `community_create_milestone()` writes them
- **Posts / comments UPDATE**: authors edit text only (column grants: `title, content, media_urls, updated_at` / `content, updated_at`). Moderation columns and counters belong to the admin actions and triggers. A milestone post is never edited, not even by its student or staff (restrictive policy)
- **Comments INSERT**: post in the tenant, not hidden, not locked, reachable course; a reply's parent is a visible comment on the same post
- **Reactions**: on visible content only; users delete their own
- **Poll votes**: one per poll, on an option of that poll. **Poll options**: staff or the poll's author, `vote_count = 0`
- **Flags (reports)**: filed `pending`, about a post or comment (exactly one) in the reporter's tenant; allowed while muted. Reviewing is service-role only (`reviewFlag`)
- **Blocks**: the blocker inserts / deletes / reads their own rows; the blocked member cannot see them
- **Mutes**: admin-only management; users can view own mute status

### Storage

Bucket: `community-assets` (public read, 10MB limit)
- Allowed types: JPEG, PNG, GIF, WebP, MP4, PDF
- Path structure: `{tenant_id}/{user_id}/{nanoid}.{ext}`
- Upload policy enforces user folder ownership
- Filenames sanitized to prevent path traversal

## File Structure

### Server Actions

| File | Functions |
|------|-----------|
| `app/actions/community.ts` | `createPost` (with attachments), `updatePost` (author only, never a milestone), `deletePost`, `createComment`, `deleteComment`, `toggleReaction`, `createPoll`, `castVote`, `uploadCommunityAsset`, `createFlag`, `getComments`, `loadMorePosts` |
| `app/actions/admin/community.ts` | `pinPost`, `unpinPost`, `lockPost`, `unlockPost`, `hidePost`, `hideComment`, `muteUser`, `unmuteUser`, `reviewFlag`, `updateCommunitySettings` |

### Pages

| Route | Role | Purpose |
|-------|------|---------|
| `/dashboard/student/community` | Student | School feed |
| `/dashboard/teacher/community` | Teacher | School feed + discussion prompt creation |
| `/dashboard/admin/community` | Admin | School feed + moderation toolbar + moderation link |
| `/dashboard/admin/community/moderation` | Admin | Flagged content + muted users management |
| `/dashboard/student/courses/[courseId]/community` | Student | Course-scoped feed (enrollment required) |
| `/dashboard/teacher/courses/[courseId]/community` | Teacher | Course-scoped feed (course ownership required) |

### Components (`components/community/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `community-feed.tsx` | Client | Main feed — filters, composer, post list |
| `post-card.tsx` | Client | Single post — author, content, media, reactions, comments |
| `post-composer.tsx` | Client | New post form — textarea, title, attachments, poll mode, discussion prompt |
| `community-settings-dialog.tsx` | Client | Admin switches: student posts in school feed, student polls, student milestones (from `COMMUNITY_SETTING_KEYS`) |
| `comment-thread.tsx` | Client | Threaded comments — load via server action, reply forms |
| `reaction-bar.tsx` | Client | 4 reaction buttons with optimistic updates |
| `post-filters.tsx` | Client | Type filters (All/Posts/Discussions/Polls/Milestones) + role filters |
| `poll-card.tsx` | Client | Poll voting UI with results bar chart |
| `milestone-card.tsx` | Component | A milestone's one-line sentence from `milestone_type` + `milestone_data` (`readMilestone()`), plain fallback for malformed data |
| `discussion-prompt-card.tsx` | Client | Discussion prompt with accent border + lesson link |
| `discussion-prompt-composer.tsx` | Client | Teacher form — title, content, lesson selector, graded toggle |
| `moderation-toolbar.tsx` | Client | Admin inline buttons — pin/lock/hide |
| `flag-dialog.tsx` | Client | Report content dialog (calls `createFlag` server action) |
| `muted-banner.tsx` | Component | Muted user warning banner |
| `empty-feed.tsx` | Component | Empty state with scope-specific messaging |
| `post-skeleton.tsx` | Component | Loading skeleton placeholder |
| `components/student/share-milestones-toggle.tsx` | Client | Student profile: "Share my milestones in the community" (`profiles.share_milestones`) |

### Tour

| File | Purpose |
|------|---------|
| `components/tours/community-tour.tsx` | Tour wrapper with replay button |
| `components/tours/tour-definitions.ts` | `getCommunityTour()` — 5 steps (student) or 6 steps (admin) |

### i18n

Keys added under `community` namespace in `messages/en.json` and `messages/es.json` (~100 keys total), including:
- Post CRUD, comments, reactions, filters
- Poll creation and voting
- Milestone sentences and the sharing preference (`community.milestones`)
- Moderation actions and settings
- Tour steps
- Error messages and validation

## Security

### Input Validation

| Check | Limit |
|-------|-------|
| Post content | Max 5,000 characters |
| Comment content | Max 2,000 characters |
| Flag reason | Max 1,000 characters |
| Poll option text | Max 200 characters per option |
| Poll options count | 2–10 options, empty strings filtered |
| Course/lesson IDs | Must be positive integers |
| File size | Max 10MB |
| Filename | Sanitized (no path traversal chars) |

### Authorization Checks

| Action | Check |
|--------|-------|
| Post to course feed | Student must be enrolled |
| Comment on course post | Student must be enrolled |
| Create discussion prompt | Teacher or admin only |
| Create milestone post | System only — `community_create_milestone()` from the source triggers; refused through RLS for everyone |
| Edit milestone post | Nobody (`updatePost` and RLS refuse) |
| React/vote while muted | Blocked |
| Post/comment while muted | Blocked |
| Flag content while muted | Allowed (can report harassment) |
| Block a member | Students and members only — staff hide content instead. Their posts and comments disappear for the blocker (RLS + `getBlockedAuthorIds` on the service-role feeds) |
| Post/comment/react/vote when the plan has no community | Blocked (RLS) |
| Pin/lock/hide post | Admin only (`verifyAdminAccess()`) |
| Mute user | Admin only, can't self-mute, expiration must be future |
| Cross-tenant operations | Blocked by explicit `tenant_id` check on every mutation |

### Database Constraints

| Constraint | Purpose |
|------------|---------|
| `no_self_reply` CHECK | Prevents comment referencing itself |
| `check_comment_depth` trigger | Max 5 levels of nesting |
| `idx_community_flags_unique_report_post` | One pending flag per user per post |
| `idx_community_flags_unique_report_comment` | One pending flag per user per comment |
| `community_poll_votes_one_per_user` | One vote per user per poll |
| `community_flags_one_target` CHECK | A report names exactly one of post_id/comment_id |
| `community_user_blocks_not_self` CHECK | Nobody blocks themselves |
| `reaction_target_check` CHECK | Exactly one of post_id/comment_id must be set |
| Unique reaction indexes | One reaction type per user per target |
| `community_posts_milestone_once` | One milestone per (school, student, type, course/level/days) — hidden posts count |

### Data Flow & RLS

**JWT Tenant Sync (proxy.ts)**

The `get_tenant_id()` RLS function reads `tenant_id` from JWT claims, which is set by `custom_access_token_hook()` from `auth.users.raw_app_meta_data.tenant_id`. When a user visits a different subdomain (different tenant), `proxy.ts` detects the mismatch and:

1. Updates `app_metadata.tenant_id` via the Supabase Admin Auth API
2. Calls `refreshSession()` so the JWT is re-issued with correct claims
3. This is a one-time sync per tenant switch — subsequent requests use the cached JWT

This ensures all RLS policies using `get_tenant_id()` return the correct tenant for the current subdomain, enabling client-side Supabase queries to work correctly.

**Server-side reads** use `createAdminClient()` with explicit `.eq('tenant_id', tenantId)` as defense-in-depth (bypasses RLS but applies tenant filter explicitly).

**Client-side comment loading** uses the `getComments()` server action for consistency with the server-side pattern.

**Mutations** (createPost, createComment, etc.) use server actions with `createAdminClient()` to ensure writes succeed regardless of JWT timing.

**Feed reads (#860)** all go through `getFeedPage()` in `lib/community/feed.ts` — the five pages and `loadMorePosts()` share one query + enrichment (author profile, author's `tenant_users.role` for the role filter/badge, the viewer's reactions and votes, poll options). It reads with the service role, so the caller owns access: `loadMorePosts(scope, cursor, courseId?)` takes NO tenant or user from the client and re-checks course access.

**Infinite scroll** uses cursor-based pagination via `loadMorePosts()`, triggered by IntersectionObserver when the user scrolls near the bottom.

**Attachments (#860)** are uploaded by `uploadCommunityAsset()`, then sent with the post as `media_urls`. `parsePostMedia()` (`lib/community/media.ts`) accepts at most 4, and only public URLs inside the poster's own `community-assets/{tenant}/{user}/` folder — never an arbitrary URL.

**School switches (#860, #871)**: `getCommunitySettings()` (`lib/community/settings.ts`) reads the keys in `COMMUNITY_SETTING_KEYS` (`lib/community/setting-keys.ts`): `community_student_posts_school_feed`, `community_student_polls`, `community_milestone_posts` (missing row = ON, same as `community_setting_on()` in RLS and the milestone triggers). Admins toggle them from the **Settings** dialog on `/dashboard/admin/community`; `updateCommunitySettings()` accepts only those keys with boolean values. The composer hides what the school has turned off.

**Post creation** triggers `router.refresh()` which causes a server re-render with fresh data, ensuring new posts appear immediately.

## Feature Gate

Community requires the `starter` plan or higher.

```typescript
// lib/plans/features.ts
export interface PlanFeatures {
  // ...
  community: boolean
}

export const FEATURE_REQUIRED_PLAN = {
  community: 'starter',
  // ...
}
```

The `community` boolean was added to the `platform_plans.features` JSONB column for all plan tiers:
- `free`: `false`
- `starter`, `pro`, `business`, `enterprise`: `true`

Pages check via `supabase.rpc('get_plan_features', { _tenant_id: tenantId })` and show `<UpgradeNudge>` if the feature is not available.

## Sidebar Navigation

Community link added for all three roles in `components/app-sidebar.tsx`:

| Role | Location | Icon |
|------|----------|------|
| Student | Main group, after My Courses | `IconMessages` |
| Teacher | Main group, after Dashboard | `IconMessages` |
| Admin | Management group, after Users | `IconMessages` |

## Guided Tour

The community tour uses Driver.js (same library as other tours in the project).

**Tour steps:**

| # | Element | Title | Description |
|---|---------|-------|-------------|
| 1 | `[data-tour="community-header"]` | Welcome to Community | Introduction to the community space |
| 2 | `[data-tour="community-composer"]` | Create a Post | How to write and share posts |
| 3 | `[data-tour="community-filters"]` | Filter Posts | Using type and role filters |
| 4 | `[data-tour="community-feed"]` | Community Feed | Where posts appear |
| 5 | `[data-tour="community-reactions"]` | React & Comment | Reactions and commenting |
| 6* | `[data-tour="community-moderation"]` | Moderation Tools | Admin-only: flagged content management |

*Step 6 only shown to admins.

**Behavior:**
- Auto-starts on first visit (localStorage: `tour-completed:community:{userId}`)
- Replay button (help icon) in top corner
- Respects `prefers-reduced-motion`
- Full en/es translations

## Admin Settings

Community settings stored in `tenant_settings` table:

A missing row means ON for every key; `{ "enabled": false }` turns one off.

| Key | Default | Purpose |
|-----|---------|---------|
| `community_student_posts_school_feed` | `true` | Allow students to post in school feed |
| `community_student_polls` | `true` | Allow students to create polls |
| `community_milestone_posts` | `true` | Post student milestones automatically (#871) |

Updated via `updateCommunitySettings()` admin action (known keys, boolean values only).

## Milestone posts (#871)

The database writes a milestone post when a student reaches one. Nothing in the app writes them; migration `20260928120000_community_milestone_posts.sql` holds the whole rule.

### Events and feeds

| `milestone_type` | When | Feed |
|---|---|---|
| `course_completion` | The lesson completion or exam score that completes the course | Course feed |
| `certificate` | An eligible certificate is issued (folded into the completion post when both happen in the same step) | Course feed |
| `level_up` | Level rises to 5 or higher (a jump announces the level reached) | School feed |
| `streak` | The streak crosses 7, 30 or 100 days (the highest threshold crossed) | School feed |

Lesson completions are not posts. "Complete" is `is_course_complete()`: `calculate_course_completion().eligible` when the course has an active certificate template, and the same rule with the template defaults (100% of published lessons, every published exam >= 70) when it does not — completion never depends on a certificate existing. `tests/sql/issue-871-community-milestones.sql` checks the two stay in step.

### Gates

`community_create_milestone(_user_id, _tenant_id, _course_id, _type, _data)` is the only writer (SECURITY DEFINER, `EXECUTE` revoked from `anon`, `authenticated` and `service_role`). It posts only when `community_milestone_allowed()` holds:

1. an active **student** of the school (staff previewing a course never announce)
2. `profiles.share_milestones` is on (the student's preference)
3. the school's `community_milestone_posts` switch is on (missing row = ON)
4. the student is not muted there
5. the plan includes the community (`community_enabled`)

A course milestone also needs `has_course_access()` and a course of that school.

### Once, and only once

- A partial unique index allows one milestone per (school, student, type, course / level / days). Hidden (deleted) posts count, so a milestone the student deleted is never posted again; an admin hard delete forgets it.
- A streak threshold is announced once per school, ever — rebuilding a 7-day streak after a break is not news.
- **The fold**: when the last lesson (or score) completes the course and the same step issues the certificate, the certificate trigger finds the completion post written in the same transaction and adds `certificate: true` to it — one post says "Completed X and earned the certificate". This relies on the completion triggers sorting before the certificate triggers on the same table (Postgres fires same-event triggers in name order); a rename degrades to two posts, and the SQL test guards the order. A certificate issued later gets its own post, once.
- A certificate only posts when the course has an active template and the student is actually eligible — a student can insert their own certificate row through RLS, and that must not become a public post.

### Failure isolation

Every source trigger catches everything and raises a `WARNING` (`#871 milestone <source>: …`): a failing milestone never breaks the lesson completion, the score, the certificate or the XP award. The course-deletion trigger is the exception on purpose — a silent failure there would move the course's milestones into the school feed.

### Data contract

Milestone posts have `content = ''`. Every client renders the sentence from `milestone_type` + `milestone_data` (web: `readMilestone()` in `lib/community/milestones.ts`), so the native app and notifications can localise it:

| `milestone_type` | `milestone_data` |
|---|---|
| `course_completion` | `{ course_id, course_title, certificate?: true }` |
| `certificate` | `{ course_id, course_title }` |
| `level_up` | `{ level }` |
| `streak` | `{ days }` |

`course_title` is a snapshot taken when the post is written.

### The preference

`profiles.share_milestones` (default `true`) is global like blocks: a student who does not want their progress announced does not want it in any school. They change it on their profile ("Share my milestones in the community", shown where the plan has the community and the school switch is on) or from the **Sharing settings** item in their own milestone post's menu. Turning it off stops new posts; earlier ones stay until the student deletes them.

Reactions and comments on milestones work like on any post.

### Known edges

- No backfill: only events after the migration announce.
- Two concurrent transactions completing the same course for the same student can each miss the other's last row and announce nothing.
- A certificate issued by the `exam_submissions` triggers before the `exam_scores` row exists is not folded (two posts).
- Revoking a certificate does not hide its milestone (`revokeCertificate` has no caller yet).
- A regrade below the bar does not take a completion post back.
- A course hard delete removes its milestones; human course posts keep the FK's `SET NULL` and move to the school feed (pre-existing).

## Infinite Scroll

The feed uses cursor-based pagination with IntersectionObserver:

1. **Server renders first page** (20 posts) and passes `initialHasMore` to the client
2. **IntersectionObserver** watches a sentinel `<div>` at the bottom of the feed
3. When visible, calls `loadMorePosts()` server action with the `created_at` cursor of the last post
4. New posts are appended to state; `PostSkeleton` shows while loading
5. When `hasMore = false`, shows "You've reached the end"
6. Pinned posts always render first (from `initialPosts`), pagination only loads non-pinned posts

```typescript
// Server action signature
export async function loadMorePosts(
  tenantId: string,
  userId: string,
  scope: 'school' | 'course',
  cursor: string,       // created_at of last post
  courseId?: number
): Promise<ActionResult<{ posts: any[]; hasMore: boolean }>>
```

## Known Limitations (v1)

- **No real-time updates** — feed refreshes via `router.refresh()`, not WebSocket/Supabase Realtime
- **No rich text rendering** — post content displayed as `whitespace-pre-wrap` plain text (no markdown)

## Future Phases

Per the implementation plan, these features are planned but not yet implemented:

- **Phase 4** — Gamification wiring (XP for posts/comments/reactions, daily caps, community achievements)
- **Phase 6** — Course highlights (pin community posts to course detail pages)
