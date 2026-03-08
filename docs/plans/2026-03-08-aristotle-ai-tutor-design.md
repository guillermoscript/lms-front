# Aristotle — Course-Level AI Tutor

## Overview

A per-course AI tutor that teachers configure with domain knowledge. Aristotle acts as a guide and content creator, generating on-the-fly practice problems, mini-explanations, and study plans. It coexists alongside existing lesson AI tasks and exercise coaches — those stay focused on immediate tasks, Aristotle handles the big picture.

## Access Points

### Floating Panel
- Small button (sparkles/brain icon) fixed to bottom-right, visible on all course pages
- Opens a ~400px slide-over panel from the right
- Context-aware: knows which lesson/exercise the student is viewing
- Persists across page navigation within the course (collapses to icon when minimized)
- Suggestions: "Explain this concept", "Give me a practice problem", "I'm stuck"

### Dedicated Study Tab
- New tab on course overview page (`/dashboard/student/courses/[courseId]`)
- Full-width chat experience for deeper study sessions
- Sidebar with past sessions (dates + topic tags, read-only)
- Suggestions: "Create a practice quiz", "What should I review before the exam?", "Build me a study plan"

## Relationship to Existing AI

Aristotle coexists alongside:
- **Lesson AI tasks** — focused, per-lesson tutoring with teacher-configured prompts
- **Exercise AI coach** — guides students through specific exercises
- **Exam AI grading** — automated assessment with teacher-configured personas

Aristotle is the course-level companion. Students use lesson/exercise chats for immediate help, Aristotle for broader questions, study plans, and practice.

## Student Context Awareness

Aristotle has access to:
1. **Course content** — lesson titles/descriptions, exercise names/types/difficulty, exam topics
2. **Student progress** — lesson completions, exercise scores, exam results, overall %
3. **Conversation history** — AI-generated summaries of past sessions (last 5)
4. **Current page context** (floating panel) — which lesson/exercise the student is viewing

## Teacher Configuration

Located in course settings (`/dashboard/teacher/courses/[courseId]/settings`):
- **Enable/disable toggle**
- **Persona** — "You are a Python expert who loves real-world analogies..."
- **Teaching approach** — "Use Socratic questioning, never give direct answers..."
- **Boundaries** — "Don't solve exercises directly, don't reveal exam answers..."
- **Preview button** — test Aristotle's behavior before deploying

## Grading Integrity

Aristotle generates practice problems but:
- No scores recorded anywhere
- No XP or gamification integration
- No pass/fail states
- Ephemeral content — lives only in the chat conversation
- Hardcoded guardrails: "focus on understanding, not answers"

Real assessment happens through exercises and exams (which Aristotle doesn't touch).

## Conversation Structure

Session-based with memory:
- Each time a student opens the dedicated tab, it's a new session
- Active session resumes if < 30 min idle
- When session ends, AI generates a ~200 word summary
- Next session injects last 5 summaries into system prompt
- Students can browse past sessions (read-only)

## System Prompt Construction

Built dynamically per request:

```
1. Teacher config → persona, teaching_approach, boundaries
2. Course structure → lesson titles, exercise names, exam topics
3. Student progress → completions, scores, overall %
4. Memory digest → last 5 session summaries
5. Current context → page the student is on (floating panel only)
6. Behavioral guardrails → hardcoded rules about not scoring, not solving, focusing on understanding
```

Token budget: summaries capped at ~200 words each, course structure uses titles only.

## Database Schema

### course_ai_tutors
| Column | Type | Notes |
|--------|------|-------|
| tutor_id | UUID PK | |
| course_id | UUID FK → courses | Unique (one per course) |
| tenant_id | UUID FK → tenants | RLS |
| persona | TEXT | Teacher-written persona description |
| teaching_approach | TEXT | Teaching methodology |
| boundaries | TEXT | What Aristotle should NOT do |
| enabled | BOOLEAN | Toggle on/off |
| model_config | JSONB | Temperature, model overrides |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### aristotle_sessions
| Column | Type | Notes |
|--------|------|-------|
| session_id | UUID PK | |
| course_id | UUID FK → courses | |
| user_id | UUID FK → profiles | |
| tenant_id | UUID FK → tenants | RLS |
| summary | TEXT | AI-generated session summary |
| topics_discussed | TEXT[] | Tags for quick reference |
| started_at | TIMESTAMPTZ | |
| ended_at | TIMESTAMPTZ | |

### aristotle_messages
| Column | Type | Notes |
|--------|------|-------|
| message_id | UUID PK | |
| session_id | UUID FK → aristotle_sessions | |
| role | TEXT | 'user' or 'assistant' |
| content | TEXT | |
| context_page | TEXT | Where the student was |
| created_at | TIMESTAMPTZ | |

## API Routes

```
POST /api/chat/aristotle/route.ts          — Main chat (streaming)
POST /api/chat/aristotle/restart/route.ts  — Start new session
GET  /api/aristotle/sessions/route.ts      — List past sessions
```

## File Map

```
-- Database --
supabase/migrations/XXXX_create_aristotle_tables.sql

-- API --
app/api/chat/aristotle/route.ts
app/api/chat/aristotle/restart/route.ts
app/api/aristotle/sessions/route.ts

-- Lib --
lib/ai/aristotle-prompt.ts          — System prompt builder
lib/ai/aristotle-summary.ts         — Session summary generator

-- Components --
components/aristotle/aristotle-panel.tsx        — Floating panel
components/aristotle/aristotle-trigger.tsx      — Floating button
components/aristotle/aristotle-study-tab.tsx    — Dedicated study tab
components/aristotle/session-list.tsx           — Past sessions sidebar
components/aristotle/aristotle-provider.tsx     — Context provider

-- Teacher --
components/teacher/aristotle-config.tsx         — Settings form

-- Modified --
app/[locale]/dashboard/student/courses/[courseId]/layout.tsx   — Add provider + trigger
app/[locale]/dashboard/student/courses/[courseId]/page.tsx     — Add study tab
app/[locale]/dashboard/teacher/courses/[courseId]/settings/page.tsx — Add config section
lib/ai/config.ts                                                — Add model config
lib/ai/prompts.ts                                               — Add guardrails
```

## MVP Exclusions (Future Phases)

- **Phase 2:** Internal mastery tracking, teacher boundaries UI, per-student mastery heatmap for teachers
- **Phase 3:** Knowledge base uploads (RAG), teacher dashboard with class-wide analytics, promotable content
