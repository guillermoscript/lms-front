# Competitive Analysis: Skool.com vs Our LMS Platform

> **Date:** March 2026
> **Purpose:** Feature-by-feature comparison to identify gaps, advantages, and strategic opportunities.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Platform Philosophy](#platform-philosophy)
3. [Pricing Comparison](#pricing-comparison)
4. [Feature-by-Feature Comparison](#feature-by-feature-comparison)
5. [What Skool Has That We Lack](#what-skool-has-that-we-lack)
6. [What We Have That Skool Lacks](#what-we-have-that-skool-lacks)
7. [Gap Analysis & Priority Matrix](#gap-analysis--priority-matrix)
8. [Strategic Recommendations](#strategic-recommendations)
9. [Sources](#sources)

---

## Executive Summary

**Skool** is a community-first platform built for creators, coaches, and membership businesses. It excels at engagement through simplicity — a Facebook-like feed, gamification, and native live calls. It intentionally avoids complexity.

**Our LMS** is a course-first, multi-tenant SaaS platform built for schools and educators. It excels at structured learning — exams, AI tutoring, certificates, gamification, and white-label multi-tenancy. It serves institutional use cases that Skool cannot.

| Dimension | Skool | Our LMS |
|-----------|-------|---------|
| **Core identity** | Community + membership platform | Multi-tenant LMS for schools |
| **Target user** | Solo creators, coaches, influencers | Schools, academies, institutions |
| **Strength** | Engagement & simplicity | Depth of learning tools & multi-tenancy |
| **Weakness** | Limited LMS features | No community/social features |
| **Market** | English-only, USD-only | Bilingual (en/es), multi-currency (LATAM) |

---

## Platform Philosophy

### Skool: "Community is the product"
Skool is built around a single idea: **the community feed is the homepage**. Courses, events, and gamification all serve the goal of keeping members engaged in the community. It's closer to a paid Facebook Group with courses bolted on than a traditional LMS. This simplicity is its superpower — and its limitation.

### Our LMS: "The school is the product"
Our platform treats each tenant as an independent school. Courses are structured educational experiences with lessons, exercises, exams, AI tutoring, and certificates. The platform serves institutional needs — role-based access, multi-tenancy, white-labeling, and compliance-ready certificate verification.

---

## Pricing Comparison

| | Skool Hobby | Skool Pro | Our Free | Our Starter | Our Pro | Our Business | Our Enterprise |
|--|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Price/mo** | $9 | $99 | $0 | $9 | $29 | $79 | $199 |
| **Transaction fee** | 10% | 2.9% | 10% | 5% | 2% | 0% | 0% |
| **Courses** | Unlimited | Unlimited | 5 | 15 | 100 | Unlimited | Unlimited |
| **Students** | Unlimited | Unlimited | 50 | 200 | 1,000 | 5,000 | Unlimited |
| **Admins** | 1 | Unlimited | 1 | ? | ? | ? | Unlimited |
| **White-label** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Custom domain** | ❌ | Pro only | ❌ | ❌ | ❌ | ✅ | ✅ |

**Key takeaway:** Skool is simpler — two plans, unlimited members/courses on both. Our platform offers more granular tiers that scale with institutional needs. Skool's unlimited members/courses at $9/mo is a strong value proposition for solo creators. Our strength is the $0 free tier and the ability to scale to enterprise white-label.

---

## Feature-by-Feature Comparison

### Community & Social

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Social feed / forum | ✅ Central feature | ❌ | **Critical gap** |
| Post creation (text, images, video) | ✅ | ❌ | **Critical gap** |
| Comment threading | ✅ | ✅ (on lessons only) | Partial |
| Direct messaging / DMs | ✅ | ✅ (DB tables exist) | Partial |
| Member profiles with activity stats | ✅ Rich profiles | ✅ Basic profiles | Minor gap |
| Member directory / discovery | ✅ | ❌ | Gap |
| Searchable discussions | ✅ | ❌ | Gap |
| Group organization / topics | ✅ (limited — single group) | ❌ | Gap |
| Reactions / likes on posts | ✅ | ✅ (on comments only) | Partial |
| Push notifications (mobile) | ✅ | ❌ | Gap |
| @mentions | ✅ | ❌ | Gap |

### Course & Content

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Course builder | ✅ Basic | ✅ Advanced | **We lead** |
| Multi-module structure | ✅ | ✅ | Parity |
| Video content | ✅ (native hosting) | ✅ (URL-based) | Minor gap |
| Text/markdown content | ✅ Basic (no rich text!) | ✅ Full MDX | **We lead** |
| PDFs & file attachments | ✅ | ✅ | Parity |
| Drip / scheduled content | ❌ | ✅ (`publish_at`) | **We lead** |
| Sequential lesson requirements | ❌ | ✅ | **We lead** |
| Course categories | ❌ | ✅ | **We lead** |
| Course status (draft/published/archived) | Limited | ✅ | **We lead** |
| Course thumbnails & descriptions | ✅ | ✅ | Parity |
| Course reviews & ratings | ❌ | ✅ | **We lead** |

### Assessments & Certification

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Quizzes / exams | ❌ | ✅ Full exam engine | **We lead significantly** |
| Multiple question types | ❌ | ✅ (MC, T/F, free text) | **We lead** |
| AI auto-grading | ❌ | ✅ (OpenAI) | **We lead** |
| Teacher manual grading | ❌ | ✅ | **We lead** |
| Certificates | ❌ | ✅ (auto-issue, PDF, verification) | **We lead** |
| Certificate verification (public) | ❌ | ✅ (`/verify/[code]`) | **We lead** |
| Exercises (11 types) | ❌ | ✅ | **We lead** |
| Audio/video evaluation | ❌ | ✅ | **We lead** |

### Gamification

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Points / XP system | ✅ (likes = points) | ✅ (action-based XP) | Parity (ours deeper) |
| Levels | ✅ | ✅ (20 levels) | Parity |
| Leaderboards | ✅ | ✅ (tenant-scoped, cached) | Parity |
| Content unlock by level | ✅ | ❌ | **Gap** |
| Streaks | ❌ | ✅ | **We lead** |
| Achievements / badges | ❌ | ✅ (30+ badges, 5 tiers) | **We lead** |
| Virtual currency / coins | ❌ | ✅ | **We lead** |
| Reward store | ❌ | ✅ (6 items) | **We lead** |
| Power-ups (double XP, streak freeze) | ❌ | ✅ | **We lead** |
| Team challenges | ✅ | ✅ (challenges table) | Parity |
| Daily caps | ❌ | ✅ | **We lead** |

### Live Events & Calendar

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Event calendar | ✅ Built-in | ❌ | **Critical gap** |
| Native video calls (Skool Call) | ✅ (up to 10,000 participants) | ❌ | **Critical gap** |
| Webinars | ✅ (native, 10K capacity) | ❌ | **Gap** |
| Live streaming | ✅ | ❌ | **Gap** |
| Call replays | ✅ (auto-publish to community) | ❌ | **Gap** |
| Call transcripts | ✅ (auto-generated) | ❌ | **Gap** |
| Timezone intelligence | ✅ | ❌ | **Gap** |
| Event RSVP | ✅ | ❌ | **Gap** |

### Monetization & Payments

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Subscription billing | ✅ | ✅ | Parity |
| One-time payments | ✅ | ✅ | Parity |
| Free communities/courses | ✅ | ✅ | Parity |
| Stripe integration | ✅ | ✅ (Connect + Billing) | **We lead** |
| Manual/offline payments | ❌ | ✅ | **We lead** |
| Multi-currency | ❌ (USD only) | ✅ (8 currencies, LATAM) | **We lead** |
| Revenue splits | ❌ | ✅ (configurable) | **We lead** |
| Payouts tracking | ❌ | ✅ | **We lead** |
| Invoices | ❌ | ✅ | **We lead** |
| Member affiliates (in-community) | ✅ (Pro plan) | ❌ | **Gap** |
| Platform affiliate program | ✅ (40% recurring lifetime) | ✅ (referral codes) | Partial |
| Free trial for memberships | ✅ (7-day trials) | ❌ | **Gap** |

### Multi-Tenancy & Branding

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Multi-tenant architecture | ❌ (single-group model) | ✅ Full multi-tenancy | **We lead massively** |
| Subdomain routing | ❌ | ✅ (`school.platform.com`) | **We lead** |
| Custom domains | ❌ | ✅ (Business+ plans) | **We lead** |
| White-labeling | ❌ (always Skool-branded) | ✅ (Enterprise plan) | **We lead** |
| Custom branding (colors/logo) | ❌ (no color/font customization) | ✅ | **We lead** |
| Role-based dashboards | ❌ | ✅ (student/teacher/admin) | **We lead** |
| Tenant settings | ❌ | ✅ | **We lead** |
| Appearance customization | ❌ | ✅ (theme colors, CSS vars) | **We lead** |

### AI & Intelligence

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| AI tutor (per course) | ❌ | ✅ (Aristotle, GPT-5-mini) | **We lead** |
| AI exercise coach | ❌ | ✅ | **We lead** |
| AI auto-grading | ❌ | ✅ | **We lead** |
| Speech-to-text evaluation | ❌ | ✅ | **We lead** |
| AI-generated feedback | ❌ | ✅ | **We lead** |
| AI lesson tasks | ❌ | ✅ | **We lead** |

### Landing Pages & Marketing

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Landing page builder | ❌ (no funnel/sales pages) | ✅ (Puck, 32 components, 8 templates) | **We lead** |
| Custom page design | ❌ | ✅ (drag-and-drop) | **We lead** |
| Sales/pricing pages | ❌ (needs external site) | ✅ (built-in) | **We lead** |
| Built-in discovery / marketplace | ✅ (Skool network) | ❌ | **Gap** |
| SEO tools | ❌ | Partial (slugs, meta) | Minor |

### Mobile & Apps

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Native iOS app | ✅ | ❌ | **Critical gap** |
| Native Android app | ✅ | ❌ | **Critical gap** |
| Push notifications | ✅ | ❌ | **Gap** |
| Dark mode (mobile) | ✅ | N/A | — |
| Responsive web | ✅ | ✅ | Parity |
| Dark mode (web) | ✅ | ✅ | Parity |

### Internationalization

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Multi-language interface | ❌ (English only) | ✅ (en + es) | **We lead** |
| Multi-currency | ❌ (USD only) | ✅ (8 currencies) | **We lead** |
| URL-based locale routing | ❌ | ✅ (`/[locale]/`) | **We lead** |
| LATAM market support | ❌ | ✅ | **We lead** |

### Integrations

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Zapier | ✅ (8,000+ apps) | ❌ | **Gap** |
| Webhooks (custom) | ✅ | ❌ | **Gap** |
| API access | Limited | ✅ (Enterprise, API tokens) | Partial |
| Stripe | ✅ | ✅ | Parity |
| OpenAI / AI services | ❌ | ✅ | **We lead** |
| Supabase ecosystem | ❌ | ✅ (DB, Auth, Storage, Edge) | **We lead** |

### Analytics & Reporting

| Feature | Skool | Our LMS | Gap |
|---------|:-----:|:-------:|:---:|
| Basic engagement metrics | ✅ | ✅ | Parity |
| Course completion tracking | ✅ Basic | ✅ Detailed | **We lead** |
| Revenue dashboard | ❌ (limited) | ✅ (teacher + admin views) | **We lead** |
| Student progress tracking | ❌ | ✅ | **We lead** |
| Platform-level analytics (super admin) | ❌ | ✅ (MRR, plan distribution) | **We lead** |
| Member activity charts | ✅ | Partial | Minor gap |
| Community engagement analytics | ✅ | ❌ | Gap |

---

## What Skool Has That We Lack

### Critical Gaps (High Impact)

| # | Feature | Impact | Effort | Notes |
|---|---------|--------|--------|-------|
| 1 | **Community feed / social forum** | Very High | High | The core of Skool's engagement. Members post, discuss, share — it's the homepage. We have zero community/social features beyond lesson comments. |
| 2 | **Native video calls (Skool Call)** | High | Very High | Built-in video conferencing for up to 10K participants. Replaces Zoom. Would require WebRTC infrastructure or third-party integration. |
| 3 | **Event calendar** | High | Medium | Schedule live sessions, workshops, Q&As. Members see upcoming events with timezone handling. |
| 4 | **Native mobile apps (iOS + Android)** | High | Very High | Skool has full-featured native apps with push notifications. We only have responsive web. |
| 5 | **Built-in discovery / marketplace** | Medium-High | High | Skool network lets users discover communities. We have no organic discovery mechanism. |

### Moderate Gaps

| # | Feature | Impact | Effort | Notes |
|---|---------|--------|--------|-------|
| 6 | **Content unlock by level** | Medium | Low | Skool lets admins gate courses/content behind gamification levels. We have levels but don't use them for content gating. |
| 7 | **Member affiliate system** | Medium | Medium | Community members can earn commissions referring other members. We have platform-level referrals but not per-community affiliates. |
| 8 | **Push notifications** | Medium | Medium | Mobile and browser push notifications for engagement. |
| 9 | **Membership free trials** | Medium | Low | 7-day free trials for paid communities. We don't offer trial periods on subscriptions. |
| 10 | **Zapier / webhook integrations** | Medium | Medium | Connect to 8,000+ apps. We have no integration ecosystem. |
| 11 | **Member directory / discovery** | Medium | Low-Medium | Browse and search community members, see activity stats. |
| 12 | **@mentions in posts/comments** | Low-Medium | Low | Tag other members in discussions. |
| 13 | **Auto-published call replays** | Low-Medium | Medium | Live call recordings auto-published to community with transcripts. |

---

## What We Have That Skool Lacks

### Massive Advantages

| # | Feature | Significance |
|---|---------|-------------|
| 1 | **Full exam/quiz engine** | Multiple question types, AI grading, teacher override, exam scheduling. Skool has zero assessment capabilities — this is a dealbreaker for schools. |
| 2 | **AI tutoring (Aristotle)** | Per-course AI tutor, exercise coach, auto-grading, speech evaluation. Skool has nothing AI-powered. |
| 3 | **Certificates with public verification** | Auto-issued PDF certificates with unique verification codes and public verification page. Skool cannot issue certificates. |
| 4 | **Multi-tenant white-label architecture** | Full subdomain routing, custom domains, white-labeling, tenant branding. Each school is independent. Skool is always Skool-branded. |
| 5 | **11 exercise types** | Quiz, coding challenge, essay, multiple choice, T/F, fill-in-blank, discussion, audio eval, video eval, real-time conversation, artifact. |
| 6 | **Landing page builder (Puck)** | 32 drag-and-drop components, 8 templates, visual editor. Skool requires an external website for sales pages. |
| 7 | **Multi-language (en/es) + multi-currency (8)** | Bilingual interface, LATAM currency support. Skool is English-only, USD-only. |
| 8 | **Advanced gamification** | 30+ achievements, streak system, virtual currency, reward store, power-ups, daily caps. Skool only has points + levels + leaderboard. |
| 9 | **Manual/offline payments** | Bank transfer workflow for LATAM markets where credit cards are less common. |
| 10 | **Drip content + sequential lessons** | Scheduled publishing and enforced lesson order. Skool has no content scheduling. |
| 11 | **Role-based dashboards** | Separate student/teacher/admin experiences with appropriate tools. Skool has one flat interface. |
| 12 | **Revenue splits & payout tracking** | Configurable platform/school revenue sharing with detailed financial tracking. |
| 13 | **5-tier pricing with feature gating** | Granular plan limits, usage meters, upgrade nudges. Skool has 2 plans with no limits. |
| 14 | **Course reviews & ratings** | Student feedback system. Skool has no course review mechanism. |
| 15 | **Platform super admin panel** | Manage all tenants, plans, referrals, impersonation, platform stats. |

---

## Gap Analysis & Priority Matrix

### Priority 1 — High Impact, Achievable (Next 3-6 months)

| Feature | Why | Suggested Approach |
|---------|-----|-------------------|
| **Community feed** | Biggest engagement gap. Every modern learning platform needs social features. Without this, students have no reason to return between lessons. | Build a tenant-scoped social feed with posts, comments, reactions, and topics. Leverage existing `chats`/`messages` tables as foundation. |
| **Event calendar** | Teachers need to schedule live sessions, office hours, workshops. | Add `events` table with tenant_id, recurrence rules, timezone handling. Calendar UI component in teacher/student dashboards. |
| **Content unlock by level** | Low-hanging fruit — we already have the full gamification system. Just need to wire levels to content access. | Add `required_level` column to courses/lessons. Check user level before granting access. |
| **Membership free trials** | Important for conversion. Let schools offer trial periods. | Add `trial_days` field to plans/products. Handle trial logic in enrollment flow. |
| **Member directory** | Students want to see who else is in their school/course. | Build a searchable member list component with basic profile info and activity stats. |

### Priority 2 — High Impact, Significant Effort (6-12 months)

| Feature | Why | Suggested Approach |
|---------|-----|-------------------|
| **Push notifications** | Critical for engagement and retention. | Implement web push via Service Workers + FCM. Consider PWA approach before native apps. |
| **Member affiliate system** | Let school members earn commissions for referrals. Powerful growth lever. | Extend existing referral system to work at the tenant/product level. |
| **Zapier / webhook integrations** | Schools need to connect their tools. Email marketing, CRM, etc. | Implement outbound webhooks for key events (enrollment, completion, payment). Add Zapier app. |
| **PWA (Progressive Web App)** | Bridge the mobile app gap without native development. | Add service worker, manifest, offline support. Much cheaper than native apps. |

### Priority 3 — Consider Long-term (12+ months)

| Feature | Why | Suggested Approach |
|---------|-----|-------------------|
| **Native mobile apps** | The full native experience. Only if PWA proves insufficient. | React Native or Expo wrapping the Next.js app. Significant investment. |
| **Live video calls** | Would match Skool Call but requires infrastructure. | Integrate with Daily.co, LiveKit, or 100ms rather than building from scratch. Embed in event calendar. |
| **Built-in marketplace / discovery** | Organic growth channel for schools. | Public school directory with search, categories, ratings. SEO-optimized. |

### Not Recommended (Skool features to skip)

| Feature | Why Skip |
|---------|----------|
| **Single flat pricing** | Our tiered model is better for institutional scaling. Keep it. |
| **Community-as-homepage** | We're a school platform, not a community platform. Courses should remain the primary experience, with community as enhancement. |
| **No rich text editor** | Skool's lack of rich text is a known weakness. We already have MDX. Don't regress. |

---

## Strategic Recommendations

### 1. Build "Community Spaces" — Don't Copy Skool's Model
Don't turn the LMS into a social network. Instead, add **course-scoped and school-scoped discussion spaces** where students interact around learning content. Think: Discourse-style forums nested within the school, not a Facebook clone.

**Suggested implementation:**
- School-level announcement feed (admin/teacher posts)
- Course-level discussion forum (student discussions per course)
- Lesson-level comments (already exists — enhance with @mentions and reactions)
- Optional general chat/discussion space per school

### 2. Leverage AI as the Differentiator
Skool has zero AI features. Our Aristotle AI tutor, auto-grading, speech evaluation, and exercise coaching are genuine competitive moats. **Double down:**
- AI-powered study recommendations
- AI-generated quiz questions from lesson content
- AI course assistant that can answer questions about any lesson
- AI-powered analytics (predict at-risk students, suggest interventions)

### 3. Go PWA Before Native
A Progressive Web App gives 80% of the native app experience at 10% of the cost:
- Push notifications via Service Workers
- Home screen installation
- Offline lesson viewing
- Fast loading via caching

### 4. Position Against Skool in Marketing
Our platform serves a market Skool explicitly doesn't:

| Skool's weakness | Our strength |
|------------------|-------------|
| "No quizzes or certificates" | Full exam engine + verified certificates |
| "English only, USD only" | Bilingual + 8 currencies |
| "Can't white-label" | Full white-label + custom domains |
| "Basic course builder" | Advanced LMS with 11 exercise types |
| "No AI features" | AI tutor, auto-grading, speech eval |
| "Single community structure" | Multi-tenant with role-based access |
| "Limited branding" | Full theme customization per school |

**Target messaging:** _"Built for real schools, not just communities. Exams, certificates, AI tutoring, and your brand — not ours."_

### 5. Watch These Skool Trends
- **Skool Games** — Monthly business competitions with prizes. Community-driven growth hack. Consider similar engagement mechanics.
- **Skool's migration from Postgres to ClickHouse** for analytics — signals they're investing in data. Our analytics should keep pace.
- **Skool Call expanding** — Native video is becoming table-stakes. Plan integration timeline.

---

## SWOT Summary

### Our Strengths (vs Skool)
- Deep LMS features (exams, exercises, certificates, AI)
- Multi-tenant white-label architecture
- LATAM market support (bilingual, multi-currency, manual payments)
- Advanced gamification (streaks, achievements, store, power-ups)
- Visual landing page builder
- Tiered pricing for institutional scaling

### Our Weaknesses (vs Skool)
- No community/social features
- No live events or calendar
- No native mobile apps
- No push notifications
- No integration ecosystem (Zapier/webhooks)
- No built-in discovery/marketplace

### Opportunities
- Community features would close the biggest gap
- PWA could bridge mobile gap quickly
- AI features are an unmatched competitive moat
- LATAM market is underserved by Skool (English/USD only)
- Schools/institutions need what we offer, not what Skool offers

### Threats
- Skool adding more course features over time
- Skool's aggressive pricing ($9/mo unlimited) pressures our free tier
- Skool's native apps create engagement advantage
- Skool's built-in discovery creates organic growth we lack

---

## Sources

- [Skool Review 2026 – Features, Pricing, Free Trial & Gamification (SkoolCenter)](https://skoolcenter.com/)
- [Brutally Honest Skool Review 2026: Pros, Cons, and Is It Worth It? (Himanshu Bisht)](https://withhimanshu.com/skool-review/)
- [Skool Review 2026: Is It the Best Community Platform? (OneBlogger)](https://www.oneblogger.com/skool-platform-review/)
- [Skool vs Teachable (2026) Comparison (Learning Revolution)](https://www.learningrevolution.net/skool-vs-teachable/)
- [Skool vs Thinkific (2026) Comparison (Learning Revolution)](https://www.learningrevolution.net/skool-vs-thinkific/)
- [Skool Pricing 2026: Plan Comparison & Fees (SchoolMaker)](https://www.schoolmaker.com/blog/skool-pricing)
- [Skool Pricing: Hobby vs Pro (SkoolCo)](https://skoolco.com/skool-pricing-en/)
- [Skool Affiliate Program (Skool Help Center)](https://help.skool.com/article/187-how-to-setup-affiliate)
- [Skool Gamification: Points & Levels (Skool Help Center)](https://help.skool.com/article/31-how-do-points-and-levels-work)
- [Skool Zapier Integration (Zapier)](https://zapier.com/apps/skool/integrations)
- [Skool Mobile App 2025 (Course Platforms Review)](https://www.courseplatformsreview.com/blog/skool-mobile-app/)
- [Skool New Features 2025: Live Streaming, Tiers, Webinars (SkoolPrep)](https://skoolprep.com/skool-new-features-2025)
- [Skool Review: Cheaper Pricing, New Features (Group.app)](https://www.group.app/blog/skool-review/)
- [Skool Review 2025: Complete Platform Analysis (Digital Tools Advisor)](https://digitaltoolsadvisor.com/skool-review/)
- [How Skool migrated from Postgres to ClickHouse (ClickHouse Blog)](https://clickhouse.com/blog/how-skool-uses-clickhouse-for-observability-behavioral-analytics)
