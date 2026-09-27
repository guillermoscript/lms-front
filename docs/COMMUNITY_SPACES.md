# Community Spaces

Community Spaces adds a school-wide social feed and per-course discussion feeds to the LMS, deeply integrated with the existing multi-tenant architecture, gamification system, and role-based access control.

## Overview

- **School Feed** — visible to all tenant members, post updates and discussions
- **Course Feed** — scoped to enrolled students + teachers of that course
- **Post Types** — standard posts, discussion prompts (teacher/admin), polls, milestone celebrations
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
supabase/migrations/20260928100000_community_notifications.sql     # #870: reply/prompt notifications, batching, retraction, push ids, digest count
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
| `trg_community_notify_on_comment` | `community_comments` | #870: notify the post author and the parent comment's author (batched) |
| `trg_community_notify_on_prompt` | `community_posts` | #870: notify the course's students of a new discussion prompt |
| `trg_community_retract_post` | `community_posts` | #870: hiding a post deletes its notifications |
| `trg_community_retract_comment` / `trg_community_retract_comment_delete` | `community_comments` | #870: hiding or deleting a comment scrubs it out of the notification that names it |
| `trg_community_retract_on_block` | `community_user_blocks` | #870: blocking someone dismisses the blocker's community notifications from them and about their posts |

### RLS Policies

All tables have RLS enabled with tenant-scoped policies using `get_tenant_id()`, `get_tenant_role()`, and `auth.uid()`.

**The database is the authority (#846).** The native app writes posts, comments, reactions, votes, reports and blocks straight through RLS, so every rule the web actions check is also a policy. The actions keep their checks for the friendly error message; they write with the service role, which bypasses RLS.

**Key access rules:**
- **Every write** (post, comment, reaction, vote) requires `community_can_write(tenant_id)`: the JWT tenant, a plan with `features.community`, and no active mute
- **Posts SELECT**: school-level visible to all tenant members; course posts require enrollment or teacher/admin role. A post by an author the viewer blocked is hidden (restrictive policy; teachers and admins are exempt)
- **Posts INSERT**: author = caller; never pinned, locked, hidden or with non-zero counters. Students: only `standard` / `poll` (polls only if `community_student_polls` is on), never graded or milestone. School feed needs `community_student_posts_school_feed` on for students; a course post needs a course of this tenant and `has_course_access` (staff always). A lesson must belong to the course
- **Posts / comments UPDATE**: authors edit text only (column grants: `title, content, media_urls, updated_at` / `content, updated_at`). Moderation columns and counters belong to the admin actions and triggers
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
| `app/actions/community.ts` | `createPost` (with attachments), `updatePost` (author only), `deletePost`, `createComment`, `deleteComment`, `toggleReaction`, `createPoll`, `castVote`, `uploadCommunityAsset`, `createFlag`, `getComments`, `loadMorePosts` |
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
| `community-settings-dialog.tsx` | Client | Admin switches: student posts in school feed, student polls |
| `comment-thread.tsx` | Client | Threaded comments — load via server action, reply forms |
| `reaction-bar.tsx` | Client | 4 reaction buttons with optimistic updates |
| `post-filters.tsx` | Client | Type filters (All/Posts/Discussions/Polls/Milestones) + role filters |
| `poll-card.tsx` | Client | Poll voting UI with results bar chart |
| `milestone-card.tsx` | Component | Celebratory milestone display |
| `discussion-prompt-card.tsx` | Client | Discussion prompt with accent border + lesson link |
| `discussion-prompt-composer.tsx` | Client | Teacher form — title, content, lesson selector, graded toggle |
| `moderation-toolbar.tsx` | Client | Admin inline buttons — pin/lock/hide |
| `flag-dialog.tsx` | Client | Report content dialog (calls `createFlag` server action) |
| `muted-banner.tsx` | Component | Muted user warning banner |
| `empty-feed.tsx` | Component | Empty state with scope-specific messaging |
| `post-skeleton.tsx` | Component | Loading skeleton placeholder |

### Tour

| File | Purpose |
|------|---------|
| `components/tours/community-tour.tsx` | Tour wrapper with replay button |
| `components/tours/tour-definitions.ts` | `getCommunityTour()` — 5 steps (student) or 6 steps (admin) |

### i18n

Keys added under `community` namespace in `messages/en.json` and `messages/es.json` (~100 keys total), including:
- Post CRUD, comments, reactions, filters
- Poll creation and voting
- Milestone celebrations
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
| Create milestone post | Teacher or admin only |
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

**School switches (#860)**: `getCommunitySettings()` (`lib/community/settings.ts`) reads `community_student_posts_school_feed` / `community_student_polls` (missing row = ON, same as `community_setting_on()` in RLS). Admins toggle them from the **Settings** dialog on `/dashboard/admin/community`; the composer hides what the school has turned off.

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

| Key | Default | Purpose |
|-----|---------|---------|
| `community_student_posts_school_feed` | `true` | Allow students to post in school feed |
| `community_student_polls` | `false` | Allow students to create polls |
| `community_milestone_posts` | `true` | Auto-generate milestone celebration posts |

Updated via `updateCommunitySettings()` admin action.

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

## Notifications (#870)

People are told when something happens in the community: in-app (bell, notifications page, sidebar badge), by push on the native app, and in the daily digest. It reuses the existing pipeline — a `notifications` row plus one `user_notifications` row per recipient — so the web, the app, `claim_pending_pushes()` (#835) and the digest all pick it up with no new delivery code.

### Kinds

One `notification_type = 'community'`; `metadata.kind` says which event. `community_post_id` links the row to its post.

| `metadata.kind` | Recipient | Row shape | Push |
|---|---|---|---|
| `community_reply` | The post author (`reply_to: 'post'`) and the parent comment's author (`reply_to: 'comment'` — wins when they are the same person) | One row per recipient (`target_type 'user'`), batched per post | Yes, at most once per (recipient, post) per 15 min. A teacher/admin reply is `priority 'high'` + `staff_reply` |
| `community_prompt` | Active students of the school with an **active enrollment** in the course who still have access (`has_course_access`) | One shared row (`target_type 'course'`) + one `user_notifications` row each | Yes, at most once per (student, course) per 15 min |
| `community_answer_accepted` | The answer's author | One row per answer, idempotent | Yes |
| `community_mention` | — | Reserved for #876 | — |

Prompts use enrollment, not just access: the RLS course feed itself requires an enrollment, and a plan subscriber should not hear about every course in the plan. School-feed prompts notify nobody (the issue asks for course prompts).

### Who is never notified

Yourself; anyone across a block, in either direction (`community_user_blocks` is global); anything about a post whose author the recipient blocked (RLS hides that post from them — a reply to their comment on it included); anything hidden — the comment, its post, or the parent comment; replies from a muted member; a recipient who is no longer an active member of the school or lost access to the course (staff always keep access); schools whose plan has no community; a comment whose `tenant_id` differs from its post's; a recipient who turned the category off — or turned `in_app_enabled` off, which we read conservatively as "no community notifications at all".

### How it is produced

AFTER triggers, so the web (service role), the native app and MCP (RLS) all produce the same notifications. Every function is `SECURITY DEFINER` with `search_path = ''`, uses `NEW.author_id` as the actor (never `auth.uid()`, which is NULL on the service-role path), and wraps its whole body in an `EXCEPTION` block that only raises a `WARNING` — a notification can never be the reason a comment or a prompt fails to save. Helpers (`community_reply_recipients`, `community_prompt_recipients`, `community_notify_can_reach`, `community_notify_wants`, `community_notify_blocked`, `community_upsert_reply_notification`) are revoked from every client role.

`created_by` is NULL on every community row. "Teachers can view their notifications" is `created_by = auth.uid()` with no tenant predicate; recording the replier there would let them read the recipient's aggregated row. The actor lives in `metadata.actor_id` / `actor_name` / `actor_role`.

Community rows are system-written: RESTRICTIVE policies refuse any client INSERT/UPDATE of a `community` row (or a row with `community_post_id`), staff included. Admin DELETE still works. Recipients may only update the read/dismiss columns of their own `user_notifications` row.

Prompt fan-out is one `INSERT … SELECT` over the partial index `idx_enrollments_course_active`: **~66 ms for 5,000 enrolled students** (measured locally, rolled back).

### Batching and the push cooldown

One **unread** reply notification per (recipient, post). A new reply updates it in place — `count`, title `(3) <post>`, the latest `comment_id`, actor and snippet — and moves `user_notifications.created_at` to now, so it rises to the top. Except while its push is still queued: `created_at` is also `claim_pending_pushes()`' queue order, and moving it on every reply sent a busy thread's push to the back of the queue again and again; the next reply after the push went out moves it. A pg advisory lock per (recipient, post) makes "update the open row, else insert" safe under concurrent replies, and the lookup is pinned to the post's tenant.

Push: while a push for the pair is still queued, or went out less than 15 minutes ago, a reply does not queue another one — the queued push simply carries the updated text. After that, the next reply re-arms it. Once the recipient reads the row, the next reply opens a fresh one (in-app only if still inside the cooldown).

Prompts keep one in-app row each (each is its own thing to answer), but their pushes follow the same rule per (student, course): a teacher adding prompts to ten lessons in one sitting sends one push, not ten.

The push sweep (`sendPendingPushes()`) claims 25 notifications at a time and claims again while claims come back full — up to 10 claims or 30 s per run. Reply and digest notifications have one recipient each, so a single claim a minute let the 17:00 digest queue a reply's push for an hour.

### Retraction

- **Hiding a post** (soft delete or moderation) deletes every notification about it, queued pushes included — as a hard delete does through the cascade.
- **Hiding or deleting a comment** that a notification names: its text is scrubbed back to the post label and the actor, snippet and `comment_id` are removed; a batch also loses one, and a notification that named only that reply — or an accepted answer — is also dismissed. Only the *latest* reply of a batch is named, so hiding an earlier one leaves the count as it is; none of its text was stored.
- **Blocking someone** dismisses the blocker's community notifications whose latest actor is the blocked member, and those about the blocked member's posts.
- Un-hiding restores nothing.

Why delete and scrub rather than dismiss: a dismissed row is still selectable by its recipient, and every teacher of the school can read the school's notifications ("Staff can view tenant notifications") — while only admins may read hidden posts and comments, and a member who deletes their account (#850) must not leave their name and words behind.

### Links

No URL is stored. `lib/community/notifications.ts` builds it from the ids for the viewer's role:

| Viewer | Course post | School post |
|---|---|---|
| Student | `/dashboard/student/courses/<courseId>/community?post=<postId>` | `/dashboard/student/community?post=<postId>` |
| Teacher | `/dashboard/teacher/courses/<courseId>/community?post=<postId>` | `/dashboard/teacher/community?post=<postId>` |
| Admin | `/dashboard/teacher/courses/<courseId>/community?post=<postId>` | `/dashboard/admin/community?post=<postId>` |

`#comment-<commentId>` is appended for a reply or an accepted answer. The feed's handling of `?post=` and the anchors is #869's. A teacher who is not the course author is redirected by the teacher course page (known edge).

### Preferences

`notification_preferences.community_replies` and `community_prompts` (default `true`, global per user — they apply in every school). The **Preferences** sheet on `/dashboard/notifications` toggles them through `setCommunityNotificationPreference()` (user-scoped upsert, own-row RLS). Off means no notification of that kind at all, in-app or push. `push_enabled` now defaults to `true` so a row created by these toggles does not silently opt out of push (existing rows keep their value).

### Web surfaces

- **Counts** — `components/notifications/notification-counts.tsx`, mounted in the dashboard layout: one browser-client RLS read of this school's unread rows (`notifications!inner` + explicit `tenant_id`), on mount, on navigation (≤ 1 per 10 s), on focus, every 60 s while visible, and after any read/dismiss. No badge while loading or after an error.
- **Sidebar** — the Community entry (student, teacher) shows a tonal count chip (`99+` cap), an sr-only "N unread community notifications", and a dot on the icon with the count in the tooltip when the sidebar is collapsed. For admins Community is under People, so the chip is on the sub-item; a collapsed People group shows nothing and the bell covers it. The badge clears when notifications are read, not when the feed is visited. The community figure has its own capped read — counted inside the all-types page it went missing behind 100 newer unread digests.
- **Unread list on the community page** — the badge links to the school feed, where a course-feed reply never shows. `components/notifications/community-unread.tsx` lists the latest 3 unread community notifications above the school feed (student, teacher, admin pages), with "View all notifications"; opening one lands on the post and marks it read, and the list disappears when nothing is unread.
- **Bell** — header, before the language switcher. Lists the latest 8 on open (loading / error + retry / "No notifications yet"), "Mark all read" (this school only) and "View all". Opening a community item marks it read with a direct own-row update.
- **Notifications page** — this school's rows only, a flat hairline list, an error state with "Try again", localized community rows with a staff role chip for teacher/admin replies. The list is the server's rows with this tab's reads/dismissals on top (`lib/notifications/local-overrides.ts`), never a one-time copy, so a retry or a mark-all from the bell shows up.

`createNotification()` (the admin/teacher broadcast tool) inserts with the service role, so it refuses any type but a broadcast type and lists its columns: a spread of the request could have forged a `community` row past the RESTRICTIVE policy.

Staff can read per-user reply notifications of their school through the existing "Staff can view tenant notifications" policy — known and accepted; retraction deletes or scrubs what they must not read.

### Push `data` contract (native app)

`claim_pending_pushes()` returns `data = { tenant_id, course_id?, post_id?, comment_id? }` (nulls stripped), and `sendPendingPushes()` sends `{ ...data, notification_id, url, kind }` — the fixed keys last, so metadata can never override them. The app routes on `kind` (`community_reply`, `community_prompt`, `community_answer_accepted`) and opens the thread in `tenant_id`'s school. Stored titles/bodies are language-neutral push text; the web renders its own localized copy from the metadata.

### Digest

`get_daily_digest_candidates()` returns `community_replies`: unread reply + accepted-answer notifications with activity in the last day (a batch counts its replies). The digest line reads "3 new replies in the community" / "3 respuestas nuevas en la comunidad" and, in the email, links to `/dashboard/notifications?src=digest`. A student whose only news is community replies now gets a digest (which is also pushed). Students only, as before; no per-reply email.

### Accepted answers (#875 hook)

`community_notify_answer_accepted(_comment_id, _actor_id)` ships but is not wired: #875's definer trigger calls it once it has enforced who may accept (the hook trusts its caller on that). Same never-notify rules; idempotent per comment; never raises.

### Tests

`tests/sql/issue-870-community-notifications.sql` (recipients incl. a parent author who is not the post author, batching, cooldown and queue order, retraction and scrubbing, blocked post authors, RLS, privileges, prompt audience and push cooldown, failure isolation, digest count — rolled back), `tests/unit/community-notifications.test.ts`, `tests/unit/notification-preferences-action.test.ts`, `tests/unit/notification-local-overrides.test.ts`, `tests/unit/admin-create-notification.test.ts`, the push/digest suites, and `tests/playwright/community-notifications.spec.ts` (student A posts, student B replies, A sees it — badge, bell, the community page's unread list — and opens it; desktop projects only).

### Deferred

Mentions and realtime delivery (#876); follower/reaction notifications (noise); school-feed prompts; per-school preferences (the table is global); a teacher digest (the digest is students-only); per-event email; quiet hours; restoring on un-hide; re-snippeting an edited comment; an "other schools have unread" indicator; native deep-link handling (app repo); wiring the #875 accept event.

## Known Limitations (v1)

- **No real-time updates** — feed refreshes via `router.refresh()`, not WebSocket/Supabase Realtime; notification counts poll (60 s) instead of subscribing
- **Notifications are per school** — the bell and the badge count the current school only; unread activity in another school shows when you visit it
- **A batched reply notification names only its latest reply** — hiding an earlier reply in the batch does not decrement the count
- **No rich text rendering** — post content displayed as `whitespace-pre-wrap` plain text (no markdown)

## Future Phases

Per the implementation plan, these features are planned but not yet implemented:

- **Phase 3** — Milestone auto-generation triggers (course completion, certificate, level-up, streaks)
- **Phase 4** — Gamification wiring (XP for posts/comments/reactions, daily caps, community achievements)
- **Phase 6** — Course highlights (pin community posts to course detail pages)
