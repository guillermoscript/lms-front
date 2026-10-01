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
supabase/migrations/20260928130000_community_notifications.sql     # #870: reply/prompt notifications, batching, retraction, push ids, digest count
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
| `app/actions/community.ts` | `createPost` (with attachments), `updatePost` (author only, never a milestone), `deletePost`, `createComment(postId, content, parentId?, { surface? })`, `deleteComment`, `toggleReaction`, `createPoll`, `castVote`, `uploadCommunityAsset`, `createFlag`, `getComments`, `loadMorePosts` |
| `app/actions/admin/community.ts` | `pinPost`, `unpinPost`, `lockPost`, `unlockPost`, `hidePost`, `hideComment`, `muteUser`, `unmuteUser`, `reviewFlag`, `updateCommunitySettings` |

### Pages

| Route | Role | Purpose |
|-------|------|---------|
| `/dashboard/student/community` | Student | School feed |
| `/dashboard/teacher/community` | Teacher | School feed + discussion prompt creation |
| `/dashboard/admin/community` | Admin | School feed + moderation toolbar + moderation link |
| `/dashboard/admin/community/moderation` | Admin | Flagged content + muted users management |
| `/dashboard/student/courses/[courseId]/community` | Student | Course-scoped feed (course access required — entitlements, via `requireCourseAccess`, not enrollment) |
| `/dashboard/teacher/courses/[courseId]/community` | Teacher | Course-scoped feed (course author or admin) |
| `/dashboard/student/courses/[courseId]/lessons/[lessonId]` | Student | The lesson's discussion prompts, answered in place (#869) |
| `/dashboard/teacher/courses/[courseId]` | Teacher | Lessons tab: prompt count per lesson + "Add discussion prompt" (#869) |

Every feed page takes `?post=<uuid>` (and `#comment-<uuid>`) — see [Deep links](#deep-links-869).

### Components (`components/community/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `community-feed.tsx` | Client | Main feed — filters, composer, post list |
| `post-card.tsx` | Client | Single post — author, content, media, reactions, comments |
| `post-composer.tsx` | Client | New post form — textarea, title, attachments, poll mode, discussion prompt |
| `community-settings-dialog.tsx` | Client | Admin switches: student posts in school feed, student polls, student milestones (from `COMMUNITY_SETTING_KEYS`) |
| `comment-thread.tsx` | Client | Threaded comments — load via server action, reply forms. `variant="learner"` for the lesson page, `surface`, `focusCommentId`; every comment is anchored `id="comment-<id>"` |
| `reaction-bar.tsx` | Client | 4 reaction buttons with optimistic updates |
| `post-filters.tsx` | Client | Type filters (All/Posts/Discussions/Polls/Milestones) + role filters |
| `poll-card.tsx` | Client | Poll voting UI with results bar chart |
| `milestone-card.tsx` | Component | A milestone's one-line sentence from `milestone_type` + `milestone_data` (`readMilestone()`), plain fallback for malformed data |
| `discussion-prompt-card.tsx` | Client | Discussion prompt in the feed — "Linked to lesson" badge (no link yet), graded badge, comment count |
| `discussion-prompt-composer.tsx` | Client | Teacher form — title, content, lesson selector, graded toggle. Props `{ courseId, lessons: { id, title }[], defaultLessonId?, onCreated?(postId), heading?, className? }`; mounted by `discussion-prompt-shortcuts.tsx` |
| `discussion-prompt-shortcuts.tsx` | Client | Teacher lesson list: one sheet for the list + a per-row `AddDiscussionPromptTrigger` (#869) |
| `lesson-discussion.tsx` | Server | The lesson's prompts behind their own `<Suspense>`; loads through `getLessonPrompts` (#869) |
| `lesson-discussion-list.tsx` | Client | Learner-register prompt list — answer count, answered/closed/graded chips, inline answer, "View in community". Answer state from `lib/community/lesson-answers.ts` |
| `moderation-toolbar.tsx` | Client | Admin inline buttons — pin/lock/hide |
| `flag-dialog.tsx` | Client | Report content dialog (calls `createFlag` server action) |
| `muted-banner.tsx` | Component | Muted user warning banner |
| `empty-feed.tsx` | Component | Empty state with scope-specific messaging |
| `post-skeleton.tsx` | Component | Loading skeleton placeholder |
| `course-community-entry.tsx` | Server | Course page "Course community" row with the activity hint (#868) |
| `course-community-links.tsx` | Server | School feed list of the student's course feeds (#868) |
| `course-welcome-prompt.tsx` | Client | Teacher offer to post a pinned "Introduce yourself" prompt (#868) |
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
- `community.courseEntry` — the course/lesson/school-feed entry points and the welcome offer (#868)

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
| Pin/unpin post | Admin, or the course's author for posts in that course (`authorizePin` → `canPinInCourse`); also `createPost` with `is_pinned=true`, course posts only (#868) |
| Lock/hide post, mute | Admin only (`verifyAdminAccess()`) |
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

**Feed reads (#860)** all go through `getFeedPage()` in `lib/community/feed.ts` — the five pages and `loadMorePosts()` share one query + enrichment (author profile, author's `tenant_users.role` for the role filter/badge, the viewer's reactions and votes, poll options). It reads with the service role, so the caller owns access: `loadMorePosts(scope, cursor, courseId?)` takes NO tenant or user from the client and re-checks course access. The visibility half of that query — this tenant, not hidden, the right feed (a course feed without a course id throws rather than reading the school feed), no blocked authors — is `visiblePostsQuery()`, shared with the lesson page (#869) so the two cannot drift.

**Infinite scroll** uses cursor-based pagination via `loadMorePosts()`, triggered by IntersectionObserver when the user scrolls near the bottom.

**Attachments (#860)** are uploaded by `uploadCommunityAsset()`, then sent with the post as `media_urls`. `parsePostMedia()` (`lib/community/media.ts`) accepts at most 4, and only public URLs inside the poster's own `community-assets/{tenant}/{user}/` folder — never an arbitrary URL.

**School switches (#860, #871)**: `getCommunitySettings()` (`lib/community/settings.ts`) reads the keys in `COMMUNITY_SETTING_KEYS` (`lib/community/setting-keys.ts`): `community_student_posts_school_feed`, `community_student_polls`, `community_milestone_posts` (missing row = ON, same as `community_setting_on()` in RLS and the milestone triggers). Admins toggle them from the **Settings** dialog on `/dashboard/admin/community`; `updateCommunitySettings()` accepts only those keys with boolean values. The composer hides what the school has turned off.

**Post creation** triggers `router.refresh()` which causes a server re-render with fresh data, ensuring new posts appear immediately.

## Lesson discussion (#869)

A teacher's `discussion_prompt` tied to a lesson (`community_posts.lesson_id`) now shows on that lesson, after the lesson content and the AI task and before the lesson's own comments.

- **Data path.** `getLessonPrompts()` (`lib/community/lesson-prompts.ts`) reads with the service role, behind the lesson page's gates (`requireCourseAccess` + `requireRowInCourse`), through `visiblePostsQuery()` plus `lesson_id` and `post_type = 'discussion_prompt'`. Not a user-scoped read, on purpose: the course-posts SELECT policy still checks `enrollments.status = 'active'`, so a student entitled through a subscription and never enrolled would see an empty discussion that the feed shows them in full.
- **Order and cap.** Pinned first, then oldest first (the order the teacher asked them), at most `LESSON_PROMPT_LIMIT` (10); a "More prompts in the course community" link covers the rest.
- **Streaming.** `<LessonDiscussion>` wraps its own `<Suspense fallback={null}>`, so the community queries (plan check + blocks, then the prompts, then the viewer's answers + one head count per prompt — three round trips) never delay the lesson. Plan off or no prompts renders nothing; a failed read renders a quiet notice with a link to the course feed, never an empty list.
- **An answer is a `community_comments` row** on the prompt, written by `createComment` with every existing check (reachable post, mute, lock, parent). It shows in the course feed under the prompt.
- **The answer count** is counted, not read from `comment_count`: one `count: 'exact', head: true` query per prompt (at most ten, in parallel — a row fetch would stop at PostgREST's `max_rows`) over visible, top-level comments by nobody the viewer blocked, the same rules the prompt's thread (`getComments`) shows them by. The feed's `comment_count` counts replies and never drops on a removal (see Known Limitations), so the two numbers can differ; each matches what its own view lists.
- **Once the thread has loaded it is the source of truth** (`lib/community/lesson-answers.ts`): every load — after posting, deleting or blocking — replaces the count, the "You answered" chip and the comment "View in community" lands on. Because answering from the lesson skips revalidation, the lesson's cached payload never learns about the answer, and browser Back re-renders from that cache; a module-level memory keyed by prompt and by the server read (`loadId`, new on every `getLessonPrompts`) gives the card back what its thread last saw. A newer server read always wins.
- **"Answered"** means the viewer has a visible top-level comment on the prompt; a reply to someone else's answer does not count.
- **`surface`.** `createComment(…, { surface: 'lesson' })` skips `revalidatePath`: in Next 16 any revalidation inside a server action re-renders the *current* route in the action's response, which for a lesson re-runs the MDX, the tutor history signing and the view stamp for a comment the thread already shows. The feed (the default) keeps revalidating. `surface` is tracked on `community_comment_created`.
- **Locked** prompts show "Answers are closed" and "Read answers"; the thread has no composer. **Hidden** prompts and **blocked** authors are filtered exactly as in the feed.
- `lesson_comments` (the lesson's own comments, reactions and XP) stay a separate system; no data moves between the two.

## Deep links (#869)

The URL contract other features link to (notifications, #870):

```
/dashboard/{student|teacher}/courses/<courseId>/community?post=<postId>#comment-<commentId>
/dashboard/{student|teacher|admin}/community?post=<postId>
```

- `parsePostParam()` (`lib/community/deep-link.ts`) accepts only a UUID — anything else is ignored (no notice), and never reaches PostgREST (22P02).
- Each page resolves it with `getFeedFocus()`, which calls `getFeedPage({ postId })` — the same tenant, hidden, scope and blocked filters as the feed. A post from another course, the school feed on a course page, a removed post or a blocked author resolves to nothing and the feed shows "This post isn't available…". `getFeedFocus` never throws.
- The focused post is scrolled to, focused, outlined and has its comments open. When it is not on the first page it leads the feed (above pinned posts) and is dropped from later pages; the pagination cursor ignores it.
- `#comment-<id>` is read on the client (the server never sees a hash) and scrolls to, focuses and highlights that comment once the thread loads. Every comment is anchored `id="comment-<id>"`, every post `id="post-<id>"`.
- The hash follows in-app navigation too. Next's router moves the URL with `pushState`, which fires no `hashchange`, so a `<Link>` from `?post=P#comment-A` to `?post=P#comment-B` (a second notification on the same post) would otherwise keep A highlighted. `CommunityFeed` re-reads the hash after every router navigation (`useSearchParams()` returns a new object on each, hash-only ones included).
- The URL is left as is, so refreshing or sharing keeps the focus.

## Teacher prompt shortcut (#869)

The Lessons tab of `/dashboard/teacher/courses/[courseId]` shows "N discussion prompts" per lesson (`getLessonPromptCounts()`, the page's user-scoped client — staff see every visible prompt of the course) and an "Add discussion prompt" button per row. All rows share ONE sheet rendered outside the rows (each row is an overlay link, and React events bubble through portals); it opens `DiscussionPromptComposer` with that lesson pre-selected. On success the sheet closes and a toast links to the new post in the course feed. `createPost` already revalidates the course page, so the count updates without a `router.refresh()`. Without the community plan the list renders as before, with no counts and no button.

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

## Entry Points (#868)

The course feeds used to be reachable only by typing the URL. Every way in is
now gated twice: the plan must include the community, and the viewer must be
able to open the feed.

### Helpers (`lib/community/access.ts`)

Server-only, service role, same contract as `getFeedPage`: the caller has
already made the access decision. The service role is deliberate — the RLS
course-post SELECT still keys on `enrollments` (see Known Limitations), so an
RLS read would tell an entitled-but-not-enrolled student "No posts yet" while
the feed they open shows posts. Client components never import this file;
they get hrefs and strings as props.

| Helper | Returns |
|--------|---------|
| `isCommunityEnabled(tenantId)` | `community_enabled()` RPC, React `cache()`d. The same gate as RLS `community_can_write` and the feed pages' `get_plan_features` check (not `hasPlanFeature`, which ignores `is_active`). Closed on error, never throws |
| `loadCourseCommunityEntry({ tenantId, viewerId, courseId })` | `{ enabled: false }` or `{ enabled: true, activity }`; `activity` is the visible-post count of the last 7 days plus the newest post, or `null` when a read failed — the viewer's blocks included (`readBlockedAuthorIds` fails closed, where `getBlockedAuthorIds` reads an error as "no blocks") |
| `courseActivityHint(activity)` / `communityPostLabel(post)` | Pure: which hint to show, and a post as one line of text |
| `hasVisibleCoursePosts({ tenantId, courseId })` | `true`/`false`, or `null` (couldn't tell → don't offer) |
| `getCommunityCourses({ tenantId, userId })` | The course feeds a student can open |
| `liveEntitledCourseIds(rows, cutoffAt, now)` | Pure TS mirror of `has_course_access()` for many courses at once |
| `canPinInCourse({ tenantId, userId, role, courseId })` | Admin, or the course's author |

**The hint** (`course-community-entry.tsx`) counts what the viewer would see on
the feed: a rolling 7-day window, hidden posts and blocked authors excluded.
Milestones are never quoted (their `content` is not human text). It reads, in
order: "N posts in the last 7 days · Latest: “title”", "Latest: “title”", "No
posts yet · Be the first to introduce yourself" — only when both reads
succeeded and found nothing — or a neutral invitation when the activity could
not be read. A failed read never renders as an empty feed.

### Surfaces

| Surface | Shown when | Link |
|---------|-----------|------|
| Student course page — row under the course actions | plan has community; after `requireCourseAccess` | `/dashboard/student/courses/{id}/community` |
| Lesson sidebar — quiet text link under the progress bar (desktop, mobile sheet, locked view) | plan has community; after `requireCourseAccess` + `requireRowInCourse` | same |
| Teacher course page — header button | plan has community; course author or admin | `/dashboard/teacher/courses/{id}/community` |
| Student school feed — "Your course communities" | plan has community; role `student` | one link per course feed |

The school feed list is every course the student's **active, unexpired
entitlements** open in this school, unless the school is past its
`access_cutoff_at` — the rule `has_course_access()` applies
(`20260724130000_access_cutoff_enforcement.sql`; keep the two in step).
Enrolled courses come first, then by title; six are visible and the rest fold
into a native `<details>` ("N more courses"). Entitlements and enrollments are
paged with `fetchAllRows`, course titles with `fetchAllRowsIn`.

### Welcome offer

A published course whose feed has no visible posts shows its **author** (not
an admin browsing it) a panel above the tabs offering a pinned "Introduce
yourself" `discussion_prompt`, pre-filled in the teacher's UI language. The
panel shows the pre-filled title and message, so "Post and pin" publishes them
in one click; "Edit" opens them in fields first ("Cancel" drops the edit). It
posts through `createPost` with `is_pinned=true`, then the teacher lands on the
course feed. It is based on state rather than on the
publish event, so it covers every way a course gets published (course form,
`createCourse`, MCP). "Not now" stores
`checklist:community-welcome-{courseId}` = `dismissed` in `user_ui_state`.

Pinning at post time is the only exception to RLS refusing a member's pinned
insert: the service-role insert in `createPost` is gated by `canPinInCourse`.

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
| `course_completion` | The lesson completion or exam score that completes the course (a regrade of a score that already passed never does) | Course feed |
| `certificate` | An eligible certificate is issued (folded into the completion post when both happen in the same step) | Course feed |
| `level_up` | Level rises to 5 or higher (a jump announces the level reached) | School feed |
| `streak` | The streak crosses 7, 30 or 100 days (the highest threshold crossed) | School feed |

Lesson completions are not posts. "Complete" is `is_course_complete()`, one rule for every course: 100% of the published lessons and every published exam scored >= 70 — `calculate_course_completion()`'s rule with the template defaults. A certificate template's thresholds decide the **certificate**, never "completed": with an 80% template the certificate posts on its own at 80% and "Completed X" follows at 100%, so the feed never says a student finished a course with lessons left. Completion never depends on a certificate existing either. `tests/sql/issue-871-community-milestones.sql` checks `is_course_complete()` and `calculate_course_completion()` stay in step.

### Gates

`community_create_milestone(_user_id, _tenant_id, _course_id, _type, _data)` is the only writer (SECURITY DEFINER, `EXECUTE` revoked from `anon`, `authenticated` and `service_role`). It posts only when `community_milestone_allowed()` holds:

1. an active **student** of the school (staff previewing a course never announce)
2. `profiles.share_milestones` is on (the student's preference)
3. the school's `community_milestone_posts` switch is on (missing row = ON)
4. the student is not muted there
5. the plan includes the community (`community_enabled`)

A course milestone also needs `has_course_access()` and a course of that school.

`award_xp()` is not callable by `anon` or `authenticated` (both overloads, revoked in the same migration): it trusts the caller's user, amount and tenant, and the level and streak it sets now publish posts, so an open `award_xp` would let anyone post "Reached level N" under any student's name. The XP triggers run as the owner; `check-achievements` uses the service role.

### Once, and only once

- A partial unique index allows one milestone per (school, student, type, course / level / days). Hidden (deleted) posts count, so a milestone the student deleted is never posted again; an admin hard delete forgets it.
- A streak threshold is announced once per school, ever — rebuilding a 7-day streak after a break is not news.
- **The fold**: when the last lesson (or score) completes the course and the same step issues the certificate, the certificate trigger finds the completion post written in the same transaction and adds `certificate: true` to it — one post says "Completed X and earned the certificate". This relies on the completion triggers sorting before the certificate triggers on the same table (Postgres fires same-event triggers in name order); a rename degrades to two posts, and the SQL test guards the order. A certificate issued earlier or later (a template below 100%, a template added afterwards) gets its own post, once.
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

`profiles.share_milestones` (default `true`) is global like blocks: a student who does not want their progress announced does not want it in any school. They change it on their profile ("Share my milestones in the community", shown wherever the plan has the community — with this school's switch off it stays, noting that nothing is posted here, because the choice still applies in the student's other schools) or from the **Sharing settings** item in their own milestone post's menu. Turning it off stops new posts; earlier ones stay until the student deletes them.

Reactions and comments on milestones work like on any post.

### Known edges

- No backfill: only events after the migration announce. The database keeps no record of a first completion, though: unticking and re-ticking a lesson of a course finished before the migration (or while sharing was off) announces it then. A regrade of an already-passing score never does.
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

A deep-linked post (`?post=`) that is not on the first page renders first and is filtered out of later pages.

```typescript
// Server action signature — tenant and viewer come from the request, never the client
export async function loadMorePosts(
  scope: 'school' | 'course',
  cursor: string,       // created_at of last post
  courseId?: number
): Promise<ActionResult<{ posts: CommunityPost[]; hasMore: boolean }>>
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
| `community_prompt_graded` (#873) | The graded student | One row per (prompt, student); a re-grade updates it and makes it unread again. Carries `score`, never the feedback text | Once (a re-grade does not push again) |
| `community_mention` (#876) | A member @mentioned in a post or comment who can see it — not when they already get a `community_reply` for that same comment | One row per mention; `target` `post`/`comment`, `mention_id`, `snippet` (tokens shown as "@Name") | Yes, at most once per (recipient, post) per 15 min |

Prompts use enrollment, not just access: the RLS course feed itself requires an enrollment, and a plan subscriber should not hear about every course in the plan. School-feed prompts notify nobody (the issue asks for course prompts).

### Who is never notified

Yourself; anyone across a block, in either direction (`community_user_blocks` is global); anything about a post whose author the recipient blocked (RLS hides that post from them — a reply to their comment on it included); anything hidden — the comment, its post, or the parent comment; replies from a muted member; a recipient who is no longer an active member of the school or lost access to the course (staff always keep access); schools whose plan has no community; a comment whose `tenant_id` differs from its post's; a recipient who turned the category off — or turned `in_app_enabled` off, which we read conservatively as "no community notifications at all".

### How it is produced

AFTER triggers, so the web (service role), the native app and MCP (RLS) all produce the same notifications. Every function is `SECURITY DEFINER` with `search_path = ''`, uses `NEW.author_id` as the actor (never `auth.uid()`, which is NULL on the service-role path), and wraps its whole body in an `EXCEPTION` block that only raises a `WARNING` — a notification can never be the reason a comment or a prompt fails to save. Helpers (`community_reply_recipients`, `community_prompt_recipients`, `community_notify_can_reach`, `community_notify_wants`, `community_notify_blocked`, `community_upsert_reply_notification`, `community_notification_post_label`, `community_notification_place_label`) are revoked from every client role.

`created_by` is NULL on every community row. "Teachers can view their notifications" is `created_by = auth.uid()` with no tenant predicate; recording the replier there would let them read the recipient's aggregated row. The actor lives in `metadata.actor_id` / `actor_name` / `actor_role`.

Community rows are system-written: RESTRICTIVE policies refuse any client INSERT/UPDATE of a `community` row (or a row with `community_post_id`), staff included. Admin DELETE still works. Recipients may only update the read/dismiss columns of their own `user_notifications` row.

**Naming the post.** `metadata.post_label` is the post's title, else an 80-character excerpt of its text, else `milestone_data.course_title` (`community_notification_post_label()`). A post with none of those — a milestone post has no title and empty content, an image-only post has no text — gets `post_label: null`, and the web says "On your post" (a reply to the recipient's own post) or "On a post" instead of an empty quote. The stored `title`, which is the push title and is not localized, then names where the post lives: the course title, else the school name (`community_notification_place_label()`) — so a push never reads `""` or `(2) `.

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

`community_notify_answer_accepted(_comment_id, _actor_id)` is called by #875's `community_on_answer_accepted()` trigger after `community_guard_accepted_answer()` has enforced who may accept (the hook trusts its caller on that). Same never-notify rules; idempotent per comment; never raises.

### Tests

`tests/sql/issue-870-community-notifications.sql` (recipients incl. a parent author who is not the post author, batching, cooldown and queue order, retraction and scrubbing, blocked post authors, RLS, privileges, prompt audience and push cooldown, failure isolation, digest count — rolled back), `tests/unit/community-notifications.test.ts`, `tests/unit/notification-preferences-action.test.ts`, `tests/unit/notification-local-overrides.test.ts`, `tests/unit/admin-create-notification.test.ts`, the push/digest suites, and `tests/playwright/community-notifications.spec.ts` (student A posts, student B replies, A sees it — badge, bell, the community page's unread list — and opens it; desktop projects only).

### Deferred

Follower/reaction notifications (noise); school-feed prompts; per-school preferences (the table is global); a teacher digest (the digest is students-only); per-event email; quiet hours; restoring on un-hide; re-snippeting an edited comment; an "other schools have unread" indicator; native deep-link handling (app repo); wiring the #875 accept event.

## Known Limitations (v1)

- **Realtime covers new posts and new comments only** (#876) — edits, hides, reactions and poll votes still need a reload; notification counts poll (60 s) instead of subscribing. A member whose JWT `tenant_id` is another school (multi-school, before the claim syncs) gets no live events there — RLS keys on the claim — and the feed simply behaves as before
- **Notifications are per school** — the bell and the badge count the current school only; unread activity in another school shows when you visit it
- **A batched reply notification names only its latest reply** — hiding an earlier reply in the batch does not decrement the count
- **No rich text rendering** — post content displayed as `whitespace-pre-wrap` plain text (no markdown)
- **Course-post RLS still keys on enrollments** — the SELECT policy "Enrolled users can view visible course posts" checks active `enrollments`, while the web (service role + entitlements) lets any student with course access read the feed. RLS clients (the native app) therefore show nothing to a student who is entitled but never enrolled (e.g. through a subscription). Switching the policy to `has_course_access()` is a follow-up
- **`comment_count` includes soft-hidden comments and replies** — `trg_community_comment_count` fires on INSERT/DELETE only, and removing a comment sets `is_hidden`, so the feed's "N comments" drifts upward. The lesson counts its answers itself and is unaffected. Fixing the trigger (`UPDATE OF is_hidden`) needs a migration and is left for a follow-up.
- **The muted banner is not wired** — no page passes `mutedUntil`; a muted member finds out from the server action's refusal toast (feed and lesson alike).
- **The web actions have no plan gate of their own** — the pages and the lesson hide the community when the plan lacks it, and RLS refuses user-scoped writes, but `createPost`/`createComment` write with the service role.
- **Deleting or blocking from the lesson thread re-renders the lesson** (those actions still revalidate); only `createComment` from the lesson skips it.

## Future Phases

Per the implementation plan, these features are planned but not yet implemented:

- **Phase 4** — Community achievements (XP shipped in #874, below)
- **Phase 6** — Course highlights (pin community posts to course detail pages)

## Questions and accepted answers (#875)

Migration `20260929150000_community_questions_875.sql`.

- **Type**: `post_type = 'question'`; students may post one wherever they may post a standard post. The composer has a "Question" toggle.
- **Columns**: `community_posts.accepted_comment_id` (FK → `community_comments`, `ON DELETE SET NULL`), `accepted_by` (FK → `profiles`, `ON DELETE SET NULL`), `accepted_at`. CHECK: only a question may have one.
- **The rule** (`community_guard_accepted_answer()`, BEFORE INSERT / UPDATE OF `accepted_comment_id`, every writer): the actor is the question's author or an ACTIVE teacher/admin of the post's school (`tenant_users`), not muted, on a plan with the community (`community_can_accept_answer()`); the answer is a visible TOP-LEVEL comment of the same post in the same school. On the RLS path the actor is `auth.uid()` and the trigger stamps it into `accepted_by`; the service role (web action `setAcceptedAnswer`) must write `accepted_by` and is held to the same rule. `authenticated` has UPDATE on `accepted_comment_id` only. Refusals: SQLSTATE `42501` (who) / `23514` (what) — map with `acceptAnswerErrorKey()`.
- **Clears**: hiding the accepted comment (`community_clear_hidden_accepted_answer()`) or deleting it (FK) un-accepts it; those run from triggers (`pg_trigger_depth() > 1`) and skip the actor check.
- **Consequences**: `community_on_answer_accepted()` (AFTER UPDATE, when a new non-null answer is set) notifies the answer's author (#870). It is the one place an accepted answer happens — #874's XP is awarded there too.
- **Thread** (`comment-thread.tsx`): the accepted answer is pinned first and highlighted; the other top-level answers are ranked by `helpful` reactions, then oldest (`rankAnswers()`); replies stay chronological. Answers carry a "Helpful" toggle, Accept / Unaccept for the author and staff, and staff authors show their role badge.
- **Filters**: `?questions=questions|unanswered|answered` on every feed page, applied by the server (`getFeedPage({ questionFilter })`, `loadMorePosts`), so the list is complete. Index `idx_community_posts_questions`.
- **Teacher dashboard**: `UnansweredQuestionsCard` counts unanswered questions in the teacher's courses and links each course to `/dashboard/teacher/courses/<id>/community?questions=unanswered`.
- **Tests**: `tests/sql/issue-875-community-questions.sql`, `tests/unit/community-questions.test.ts`, `tests/playwright/community-questions.spec.ts` (ask → answer → accept, filters, dashboard; desktop only).

## XP for participation (#874)

Migration `20260929160000_community_xp_874.sql`. The database awards; no client can.

| Action type | XP | Limit | `reference_id` |
|---|---|---|---|
| `community_prompt_answer` — first top-level comment on a discussion prompt | 15 | once per prompt (instead of the comment XP) | prompt post id |
| `community_post` — standard/question/prompt post in a course feed | 5 | 3 / UTC day | post id |
| `community_comment` — comment or reply | 3 | 10 / UTC day | comment id |
| `community_helpful_received` — `helpful` on your post/comment, never self | 2 | 20 / UTC day, once per (target, reactor) | `<target id>:<reactor id>` |
| `community_answer_accepted` — your answer accepted, never your own question | 25 | once per question | question post id |
| `community_prompt_graded` — a teacher graded your answer to a graded prompt (#873; not for a "no answer" grade) | 20 | once per prompt | prompt post id |

- `community_xp_rule(action)` is the registry (amount, cap, once); `community_award_xp()` applies it under a per-(user, action) advisory lock and calls `award_xp(..., _tenant_id)` with the host row's school. Both are revoked from clients.
- Triggers: `trg_community_xp_on_post`, `trg_community_xp_on_comment`, `trg_community_xp_on_helpful` (AFTER INSERT) and the extended `community_on_answer_accepted()`. Each award is wrapped in `EXCEPTION WHEN OTHERS -> RAISE WARNING`, so XP never blocks posting.
- Daily caps count `gamification_xp_transactions` for (user, action, tenant) since UTC midnight. Polls, milestone posts, school-feed posts, content inserted hidden and `like`/`insightful`/`fire` earn nothing. Deleting or hiding later does not revoke XP (v1).
- Leagues and leaderboards sum every XP row regardless of type, so community XP counts toward weekly leagues with no change. It also extends the daily streak like any other XP.
- Web: `createPost` / `createComment` read back what the insert earned (`readCommunityXpEarned()`, `lib/community/xp.ts`) and the composer/thread show "+N XP" (`components.gamification.xpAwarded.community*`).
- **Tests**: `tests/sql/issue-874-community-xp.sql`, `tests/unit/community-xp.test.ts`.

## Graded discussion prompts (#873)

Migration `20260930120000_community_prompt_grades_873.sql`. A teacher ticks **Graded discussion** on a prompt (optionally with a **due date**), students answer it, and the teacher grades each student.

- **Table** `community_prompt_grades`: `tenant_id`, `post_id` (the prompt), `student_id`, `comment_id` (the answer the grade was given for; the student's latest visible top-level answer when left NULL; NULL = graded without an answer), `score` 0–100, `feedback` (≤ 5000), `graded_by`, `graded_at`. **UNIQUE `(post_id, student_id)`** — one grade per student per prompt, whatever the number of answers.
- **The rule** (`community_guard_prompt_grade()`, BEFORE INSERT/UPDATE, every writer): the grader is an active teacher/admin of the prompt's school on a plan with the community (`auth.uid()` on the RLS path, stamped into `graded_by`; the service role must name one); the prompt is a visible, graded `discussion_prompt` of a course in that school; the student is an active student of it; `comment_id` is that student's top-level answer to that prompt; tenant/post/student never change. `graded_at` is the server's clock. System clears (`ON DELETE SET NULL` of the answer or the grader's account) pass through.
- **RLS**: a student reads only their own rows; staff of the row's school (`is_staff_of`) read/insert/update/delete; nobody else. `authenticated` may UPDATE only `score`, `feedback`, `comment_id`.
- **Consequences** (`community_on_prompt_graded()`): 20 XP once per prompt (#874, only for an actual answer) and a `community_prompt_graded` notification (#870, category `replies`). Saving an identical grade is silent. Deleting a grade withdraws its notification; XP stays.
- **Due date** `community_posts.due_at`: only on a graded prompt (CHECK). Informational — shown as "Due in 3 days" / "Due today" / "Past due"; later answers are still accepted and gradeable.
- **Certificates (v1 decision)**: a graded prompt does **not** count toward course completion and does **not** gate certificate eligibility (`checkCertificateEligibility` / the certificate RPCs are untouched). Grades appear in the student's progress page only.

### Surfaces

| Where | What |
|---|---|
| `/dashboard/teacher/courses/[courseId]/community/prompts/[postId]` | Grading view (course author or admin): every active student enrolled in the course, plus any student who answered or was graded; answered / graded / not answered; all of a student's answers; score + feedback form. Filters **To grade** (default), Graded, Not answered, All |
| Prompt card in the course feed (staff) | "Grade answers" link on a graded prompt |
| Teacher dashboard | `PromptsToGradeCard` — answers waiting for a grade per prompt (`getPromptsToGrade()`) |
| Prompt card in the feed + lesson page (student) | Due badge; the student's own score and feedback once graded ("Answered — not graded yet" on the lesson before that). The feed and lesson loaders read only the viewer's own grade (`getViewerPromptGrades()`) |
| `/dashboard/student/progress` | "Discussion grades" per course |

- Code: `lib/community/prompt-grades.ts` (pure helpers), `lib/community/prompt-grading.ts` (loaders), `app/actions/teacher/community-grades.ts` (`savePromptGrade`, `removePromptGrade` — the teacher's RLS client; the database is the authority), `components/community/prompt-grading-view.tsx`, `prompt-grade.tsx`, `prompts-to-grade-card.tsx`.
- AI-suggested grades (issue scope item 8) are deferred.
- **Tests**: `tests/sql/issue-873-community-prompt-grades.sql`, `tests/unit/community-prompt-grades.test.ts`, `tests/playwright/community-prompt-grading.spec.ts`.

## Live feed and @mentions (#876)

Migration `20261001150000_community_realtime_mentions_876.sql`.

### Realtime

- `community_posts` and `community_comments` are in the `supabase_realtime` publication. **`community_reactions` is not**: its SELECT policy is tenant-wide, so a tenant-filtered subscription would hand out who reacted to posts in courses the subscriber cannot open. Reaction counts stay optimistic.
- Postgres Changes runs every event through the subscriber's RLS (JWT `tenant_id`, course enrollment, blocks, `is_hidden`). On top of that each channel is narrowed: the school feed by `tenant_id`, a course feed by `course_id`, an open thread by `post_id` (`lib/community/realtime.ts`). A super admin, whom RLS lets read every school, still only hears the feed on screen.
- An event is only a signal; the payload is never rendered. The feed re-reads through `loadNewPosts` → `getFeedPage({ after })` (same access check and filters as every page) and shows **"N new posts"** at the top — nothing moves under the reader until they press it. An open thread re-reads through `getComments`. Both catch up when a dropped socket rejoins.
- `hooks/use-realtime-inserts.ts`: one channel per mounted feed and per open thread, a unique topic per mount (supabase-js reuses channels by topic), removed on unmount or when the filter changes.

### Mentions

- Composer form: `[@Name](mention:<uuid>)`, written by the autocomplete in `components/community/mention-textarea.tsx` (type `@`, ↑/↓, Enter/Tab, Escape). The web renders it as a highlighted name (`CommunityMarkdown`, `urlTransform` keeps only a well-formed `mention:<uuid>`); any other renderer shows "@Name".
- **The database decides who was mentioned.** AFTER triggers on posts and comments (insert, and a content edit) parse the text (`community_parse_mentions`, max 10 people) and record `community_mentions` rows only for members who can see the content (`community_mention_eligible`: active in the school; for a course, staff or actively enrolled with access; no block with the author either way; has not blocked the post's author). An edit that removes a mention deletes it and its notification. Clients cannot write `community_mentions`; a member can read the mentions they made or received.
- Notification: kind `community_mention` (see Kinds). Never for the author, a muted author, a school without community, someone who turned **Mentions** off (`notification_preferences.community_mentions`, new toggle in Preferences), or someone who already gets the reply notification for that comment. Hiding the post or comment retracts it through #870's triggers.
- Autocomplete: `searchMentionCandidates` → `community_mention_candidates(_tenant_id, _course_id, _post_id, _query)` (user-scoped; the caller must be able to see the post/feed; blocked members either way are left out; at most 8; prefix matches first).
- **Tests**: `tests/sql/issue-876-community-mentions.sql`, `tests/unit/community-mentions.test.ts`, `tests/playwright/community-realtime-mentions.spec.ts` (protocol-level isolation with three sessions, two-browser live feed, autocomplete, channel cleanup).
