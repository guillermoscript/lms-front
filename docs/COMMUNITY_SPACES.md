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

### Database Tables (7 tables)

| Table | Purpose |
|-------|---------|
| `community_posts` | Core posts — school-level (`course_id NULL`) or course-scoped |
| `community_comments` | Threaded comments with `parent_comment_id` self-reference |
| `community_reactions` | Polymorphic reactions on posts or comments (like/helpful/insightful/fire) |
| `community_poll_options` | Poll answer choices linked to poll-type posts |
| `community_poll_votes` | One vote per user per poll (unique constraint) |
| `community_user_mutes` | Admin-managed mutes with optional expiration |
| `community_flags` | Content reports with pending/reviewed/dismissed workflow |

### Migrations

```
supabase/migrations/20260314200000_create_community_tables.sql     # Tables, indexes, triggers, RLS, storage
supabase/migrations/20260314210000_community_security_fixes.sql    # Hardened triggers, storage policies, flag dedup
supabase/migrations/20260314220000_community_edge_case_fixes.sql   # Self-reply constraint, depth limit, enrollment RLS
```

### Triggers

| Trigger | Table | Purpose |
|---------|-------|---------|
| `set_community_posts_updated_at` | `community_posts` | Auto-update `updated_at` |
| `set_community_comments_updated_at` | `community_comments` | Auto-update `updated_at` |
| `trg_community_comment_count` | `community_comments` | Increment/decrement `community_posts.comment_count` |
| `trg_community_reaction_count` | `community_reactions` | Increment/decrement `community_posts.reaction_count` |
| `trg_check_comment_depth` | `community_comments` | Reject comments nested deeper than 5 levels |

### RLS Policies

All tables have RLS enabled with tenant-scoped policies using `get_tenant_id()`, `get_tenant_role()`, and `auth.uid()`.

**Key access rules:**
- **Posts SELECT**: school-level visible to all tenant members; course posts require enrollment or teacher/admin role
- **Posts INSERT**: authenticated + tenant match; students can't create `discussion_prompt` or `milestone` types
- **Comments INSERT**: requires unlocked post + enrollment for course-scoped posts
- **Reactions**: users can create/delete own reactions
- **Mutes/Flags**: admin-only management; users can view own mute status and create flags

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
| `app/actions/community.ts` | `createPost`, `updatePost`, `deletePost`, `createComment`, `deleteComment`, `toggleReaction`, `createPoll`, `castVote`, `uploadCommunityAsset`, `createFlag`, `getComments`, `loadMorePosts` |
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
| `post-composer.tsx` | Client | New post form — textarea, title, image upload, post type |
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

**Infinite scroll** uses cursor-based pagination via the `loadMorePosts()` server action, triggered by IntersectionObserver when the user scrolls near the bottom.

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

## Known Limitations (v1)

- **No real-time updates** — feed refreshes via `router.refresh()`, not WebSocket/Supabase Realtime
- **No rich text rendering** — post content displayed as `whitespace-pre-wrap` plain text (no markdown)
- **Role filter** — "By Teachers" / "By Students" filter UI exists but is not yet functional (author role not stored on posts)
- **Media URLs not attached to posts** — file upload works but URLs must be manually referenced in content

## Future Phases

Per the implementation plan, these features are planned but not yet implemented:

- **Phase 3** — Milestone auto-generation triggers (course completion, certificate, level-up, streaks)
- **Phase 4** — Gamification wiring (XP for posts/comments/reactions, daily caps, community achievements)
- **Phase 5** — Admin settings tab integration in the settings page
- **Phase 6** — Course highlights (pin community posts to course detail pages)
