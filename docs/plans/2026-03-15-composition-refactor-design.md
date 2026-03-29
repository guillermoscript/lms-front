# Composition & Performance Refactor — Design Document

**Date:** 2026-03-15
**Status:** Approved
**Skills Applied:** vercel-composition-patterns, vercel-react-best-practices

## Goal

Refactor the LMS frontend codebase to follow Vercel's React composition patterns and performance best practices. Break monolithic components into composable pieces, move mutations to server actions, add Suspense boundaries, and optimize bundle size.

## Agent Team Architecture

Three agents in an assembly-line pipeline:

| Agent | File | Role | Model | Permission |
|-------|------|------|-------|------------|
| Analyst | `.claude/agents/analyst.md` | Read code + skill rules → produce refactor plan | opus | plan (read-only) |
| Refactor | `.claude/agents/refactor.md` | Apply code changes → verify build | opus | acceptEdits |
| QA+Report | `.claude/agents/qa-report.md` | Test via Playwright MCP → write report | sonnet | default |

### Pipeline Flow

```
Lead assigns subtask
    → Analyst reads code, writes docs/refactor-plans/<name>-plan.md
    → YOU review plan
    → Refactor Agent applies changes, runs npm run build
    → YOU review diff
    → QA+Report Agent tests pages, writes docs/refactor-reports/YYYY-MM-DD-<name>.md
    → Subtask complete
```

### Test Accounts (from supabase/seed.sql)

| Role | Email | Password | Tenant URL |
|------|-------|----------|------------|
| Student | student@e2etest.com | password123 | http://lvh.me:3000 |
| Admin/Owner | owner@e2etest.com | password123 | http://lvh.me:3000 |
| Teacher/Admin | creator@codeacademy.com | password123 | http://code-academy.lvh.me:3000 |
| Student | alice@student.com | password123 | http://code-academy.lvh.me:3000 |

## Audit Findings

### Codebase Scale
- 106 pages, ~280 components, 29 server actions, 4 hooks
- 175 client components (52.7%) / 157 server components (47.3%)
- 9 components over 500 lines

### Anti-Patterns by Severity

| # | Issue | Severity | Count | Rule |
|---|-------|----------|-------|------|
| 1 | Zero Suspense boundaries | CRITICAL | All pages | async-suspense-boundaries |
| 2 | Mutations in 'use client' | CRITICAL | 3 files | server-auth-actions |
| 3 | Heavy monolithic client components (500-1200+ lines) | HIGH | 9 files | architecture-compound-components |
| 4 | useEffect data fetching | HIGH | 4+ files | async-suspense-boundaries |
| 5 | Zero dynamic imports | MEDIUM | 3+ files | bundle-dynamic-imports |
| 6 | Boolean prop proliferation | MEDIUM | Several | architecture-avoid-boolean-props |
| 7 | God hook (useGamification) | MEDIUM | 1 hook | state-context-interface |
| 8 | Sequential awaits | MEDIUM | 3 locations | async-parallel |
| 9 | forwardRef (React 19) | LOW | 1 file | react19-no-forwardref |

## Phased Execution Plan

### Phase 0: Shared Infrastructure (6 subtasks)

| # | Target | Anti-Pattern | Rule |
|---|--------|-------------|------|
| 0.1 | Add Suspense boundaries to dashboard layouts | Zero streaming | async-suspense-boundaries |
| 0.2 | Add next/dynamic to heavy component imports in pages | No code splitting | bundle-dynamic-imports |
| 0.3 | Split useGamification hook (260 lines, 13 return values) | God hook | state-context-interface |
| 0.4 | Fix forwardRef usage → React 19 ref-as-prop | Deprecated API | react19-no-forwardref |
| 0.5 | Parallelize sequential awaits in server pages | Serial fetches | async-parallel |
| 0.6 | Create shared server action patterns for mutations | No standard | server-auth-actions |

### Phase 1: Teacher Dashboard (8 subtasks)

| # | Target | Anti-Pattern | Rule |
|---|--------|-------------|------|
| 1.1 | lesson-editor.tsx (866 lines) — extract mutations to server action | Client-side DB writes | server-auth-actions |
| 1.2 | lesson-editor.tsx — split into compound components | Monolith | architecture-compound-components |
| 1.3 | exercise-builder.tsx (743 lines) — extract mutations | Client-side DB writes | server-auth-actions |
| 1.4 | exercise-builder.tsx — split into compound components | Monolith | architecture-compound-components |
| 1.5 | exam-builder.tsx (658 lines) — extract mutations | Client-side DB writes | server-auth-actions |
| 1.6 | exam-builder.tsx — split into compound components | Monolith | architecture-compound-components |
| 1.7 | certificate-template-form.tsx (692 lines) — extract + split | Monolith + mutations | combined |
| 1.8 | Teacher pages — add Suspense boundaries | No streaming | async-suspense-boundaries |

### Phase 2: Student Dashboard (6 subtasks)

| # | Target | Anti-Pattern | Rule |
|---|--------|-------------|------|
| 2.1 | lesson-comments.tsx — replace useEffect fetch with server component or SWR | Client waterfall | async-suspense-boundaries |
| 2.2 | course-reviews.tsx — same pattern | Client waterfall | async-suspense-boundaries |
| 2.3 | Browse page cards — boolean props → explicit variants | Boolean proliferation | architecture-avoid-boolean-props |
| 2.4 | Student pages — add Suspense boundaries | No streaming | async-suspense-boundaries |
| 2.5 | Student pages — parallelize server fetches | Serial awaits | async-parallel |
| 2.6 | Minimize props serialization to client components | Over-serialization | server-serialization |

### Phase 3: Admin Dashboard (6 subtasks)

| # | Target | Anti-Pattern | Rule |
|---|--------|-------------|------|
| 3.1 | course-selector.tsx — useEffect fetch → server component or props | Client waterfall | async-suspense-boundaries |
| 3.2 | Puck editor — add next/dynamic with ssr: false | Eager load of heavy editor | bundle-dynamic-imports |
| 3.3 | Admin analytics/stats pages — add Suspense | No streaming | async-suspense-boundaries |
| 3.4 | Admin pages — parallelize server fetches | Serial awaits | async-parallel |
| 3.5 | Landing page components — split server/client | Over-clientification | server-serialization |
| 3.6 | Product/plan forms — extract mutations to server actions | Client mutations | server-auth-actions |

### Phase 4: Platform Super Admin (3 subtasks)

| # | Target | Anti-Pattern | Rule |
|---|--------|-------------|------|
| 4.1 | Platform pages — add Suspense boundaries | No streaming | async-suspense-boundaries |
| 4.2 | Platform pages — parallelize fetches | Serial awaits | async-parallel |
| 4.3 | Tenant detail page — minimize client serialization | Over-serialization | server-serialization |

### Phase 5: Public Routes + AI Elements (4 subtasks)

| # | Target | Anti-Pattern | Rule |
|---|--------|-------------|------|
| 5.1 | prompt-input.tsx (1,263 lines) — decompose into compound components | Monolith | architecture-compound-components |
| 5.2 | Public pages — dynamic import for checkout form | Eager load | bundle-dynamic-imports |
| 5.3 | AI elements — lazy load heavy components | Bundle size | bundle-conditional |
| 5.4 | Public pages — add Suspense for course catalog | No streaming | async-suspense-boundaries |

## Artifacts

- **Refactor plans:** `docs/refactor-plans/<component-name>-plan.md`
- **Test reports:** `docs/refactor-reports/YYYY-MM-DD-<component-name>.md`
- **Agent definitions:** `.claude/agents/analyst.md`, `refactor.md`, `qa-report.md`

## Total: 33 subtasks across 6 phases
