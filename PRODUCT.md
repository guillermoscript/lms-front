# Product

## Register

product

Default register for all design work. Two exceptions run in **brand** register and should be treated as such per task, without changing this default:

- `app/[locale]/(public)/*` (landing, `/about`, `/pricing`, `/platform-pricing`, `/creators`, `/courses`, public product pages)
- Puck landing-page blocks and anything the AI landing-page builder emits, since those are marketing surfaces authored by tenants

## Users

Four groups, all first-class. They differ in session length, device, and tolerance for chrome.

**Students learning.** The core user. In a lesson, exercise, checkpoint, or exam, often for a long stretch, frequently on a phone, across LATAM and English-speaking markets. Their job: understand the material and prove they understood it. They are adults or older teens, not children. Bandwidth and device quality vary widely, so weight and latency are accessibility concerns here, not just performance ones.

**Creators and solo educators.** Building and selling courses on their own subdomain. Their job: ship a course and get paid. Critically, they judge this platform by how it makes *them* look to *their* students. Every learner-facing surface is the creator's storefront, which means learner polish is a creator-retention feature.

**School admins and teachers.** Multi-staff operations: analytics, grading, enrollment, payouts, tenant settings, plan limits. Their job: see the state of the school and act on it. They scan, compare, and drill down. Density and scan-speed serve them better than whitespace.

**Prospective buyers.** Creators and schools evaluating the platform on the public site before signing up. Short sessions, high skepticism, comparing against Teachable and Thinkific in one tab each.

Platform super-admins exist (`/platform/*`) but are a small internal audience and never drive design decisions.

## Product Purpose

Multi-tenant LMS where every school operates as an independent tenant on its own subdomain with its own branding, students, and payment rails. Creators build block-editor courses with exercises, checkpoints, and AI-graded exams; students enroll, learn, and earn verifiable certificates; schools get analytics, payouts, and provider-agnostic payments built for markets where cards fail.

The product exists because the LATAM independent-educator market is served badly: the incumbent hosted platforms assume US card payments and English-first UX, and the open-source alternatives look like 2009. Success means a solo educator in Caracas or Bogotá can stand up a school in under five minutes, take payment in whatever their students can actually pay with, and have the result look better than what a funded competitor ships.

Open source, MIT, self-hostable. The codebase is also a reference implementation for multi-tenant Supabase RLS patterns, so it gets read by engineers as well as used by educators.

## Brand Personality

**Minimal, elegant, focused.** Content over chrome. Hierarchy through typographic weight and scale rather than color and ornament. Nothing on screen that is not doing work.

Voice: direct, plain, competent. Speaks to adults who are here to learn or here to run a business. Never chirpy, never congratulatory for its own sake, never apologetic. Encouragement is earned and specific ("3 of 5 checkpoints cleared") rather than generic ("Great job!").

Emotional goal on learning surfaces: **calm momentum.** The learner should feel steady forward motion without being hyped at. Emotional goal on staff surfaces: **grounded confidence.** The admin should feel the numbers are real and the system is not hiding anything.

Bilingual by construction (en/es). Spanish is not a translation layer bolted on, it is a first-class render target, and Spanish strings run roughly 20 to 30 percent longer than English. Any layout that only survives in English is broken.

## Anti-references

**Generic shadcn template.** Default zinc palette, identical icon-heading-text card grids repeated down the page, every element wrapped in a bordered box, hero-metric rows of big numbers with small labels. This is the single most likely failure mode here, because the project genuinely is built on shadcn and the path of least resistance leads straight into it. Using the component library is fine. Looking like its documentation site is not.

**Gamified candy.** The product has XP, levels, streaks, achievements, leagues, and a coin store, and that entire subsystem is one bad decision away from looking like a children's app. No cartoon mascots, no ambient confetti, no bouncy or elastic motion, no saturated primary-color reward badges, no exclamation marks in system copy. These users are adults, and the creator's professional reputation is attached to what they see.

**Cluttered enterprise LMS.** Moodle, Blackboard, Canvas. Dense nav trees, competing toolbars, tables with no hierarchy, five ways to reach the same page.

**SaaS marketing cliché.** Gradient-text headlines, glassmorphic hero cards, purple-and-blue mesh gradients. Especially relevant to the public site and to anything the AI landing-page builder is allowed to emit.

## Design Principles

**1. Momentum without candy.**
Take the pedagogical core of Duolingo and Khan Academy, visible progress, a clear next action, feedback that lands immediately, and reject their visual register entirely. Momentum is communicated through position, sequence, and state changes, not through rewards theater. Concretely: progress belongs in the layout (where you are in the sequence, what unlocks next), motion conveys the state change and then stops, and gamification surfaces read as a quiet ledger rather than a slot machine. If a learner surface would embarrass an adult professional in a coffee shop, it is wrong.

**2. Density is a property of the surface, not the system.**
One token set, two spacing and information-density registers. Learner surfaces (lesson, exercise, checkpoint, exam, browse) are calm, spacious, single-focus, one primary action visible. Staff surfaces (analytics, grading queues, payouts, enrollment, platform panel) are dense, comparative, and scan-first, and accept smaller type and tighter rows in exchange for seeing more at once. Never average the two into a compromise that serves neither.

**3. The tenant supplies the brand, we supply the structure.**
Tenants override the primary and accent colors through CSS custom properties, so no layout, hierarchy, or affordance may depend on a specific hue. Two schools must be recognizably the same product and recognizably different brands. Practically: contrast, emphasis, and state must survive an arbitrary tenant color, meaning color is never the only carrier of meaning, and every derived ink must be computed rather than hardcoded. This is not theoretical, it has already shipped as a bug (#569).

**4. Every learner surface is the creator's storefront.**
The creator is selling to their own students on our UI. A rough edge in a lesson player is not a learner annoyance, it is a churn risk for the paying customer. Weight learner-surface polish accordingly, above internal staff tooling, when effort has to be split.

**5. Never render absent, stale, or unearned state as if it were real.**
Missing data shows as missing. Ungraded shows as ungraded, not as zero. Estimates are labeled as estimates. Empty states say what is actually true and what to do next rather than filling space with a plausible-looking placeholder. Money, grades, and progress are the three places where a confident-looking lie costs the most trust, and all three have already produced real bugs here (#567, #568). Design for the empty and error case in the same pass as the happy path, never as a follow-up.

## Accessibility & Inclusion

**Target: WCAG 2.2 AA, verified under tenant theming.** AA is the floor, not the aspiration, and it must hold for every tenant primary color, not just the default teal. A contrast check that only passes against the shipped palette has not been done.

- **Color is never the sole carrier of meaning.** Status, validation, correctness, and severity always pair color with text, icon, or position. Serves color-blind users and survives arbitrary tenant hues at the same time.
- **`prefers-reduced-motion` is respected everywhere.** Under reduced motion, transitions become instant state changes, not slower animations. Nothing essential is communicated only through movement.
- **Full keyboard operability** with visible focus. Focus rings must remain visible against tenant-overridden backgrounds.
- **Bilingual layout resilience.** Every layout is checked in Spanish. Text does not truncate, wrap awkwardly, or overflow its container in either language.
- **Long-session legibility.** Learning surfaces carry the longest reading sessions in the product. Body copy stays at 65 to 75ch, and both light and dark themes are genuinely usable rather than one being an afterthought.
- **Real-world devices and networks.** Mid-range Android and constrained mobile bandwidth are the assumed baseline for the LATAM student audience, not an edge case.
