Student Features Plan for MCP Server
===================================

Goal
----
Describe a prioritized, implementable plan to add student-focused MCP tools to the MCP server. Each feature includes purpose, input/output contract, auth/RLS considerations, DB changes (if any), prompt/template guidance, acceptance criteria, and a suggested implementation timeline.

Executive summary
-----------------
- Add a small set of high-value, low-risk tools first: `student_summary`, `generate_flashcards`, `practice_quiz`.
- Follow with feedback & submission helpers (`submit_exercise`, `request_feedback`) that reuse existing RPCs.
- Add personalized learning and study orchestration (`recommend_next_lessons`, `create_study_plan`) once core tooling is stable.

Prioritized features
--------------------

1) generate_flashcards (High priority, low DB change)
   - Purpose: Produce N flashcards from a lesson or course to help spaced repetition and revision.
   - Input contract:
     {
       "lesson_id": "uuid | number",
       "count": 10,            // optional, default 10
       "format": "qa"|"cloze" // optional
     }
   - Response:
     {
       "lesson_id": "...",
       "flashcards": [ { "front": "Q", "back": "A", "meta": {...} } ]
     }
   - Auth/RLS: Student role required; read lesson content via existing RLS-safe queries.
   - DB changes: None required initially. Optionally store generated sets in `student_flashcard_sets` for reuse (migration needed).
   - Prompt template: Provide clear instruction to LLM: extract 8-12 concise Q/A pairs, keep answers short, include source location (paragraph index or timestamp if available).
   - Acceptance criteria: JSON output matches schema, quality spot-checked on 10 lessons, ru‑safe.
   - Timebox: 2–3 days (tool + registration + docs).

2) student_summary (High priority, very low DB change)
   - Purpose: Produce a concise summary (short, medium, long) of lesson/course content.
   - Input:
     { "lesson_id": "...", "length": "short|medium|long" }
   - Response:
     { "lesson_id":"...", "summary": "...", "highlights": ["..." ] }
   - Auth/RLS: Student role; must respect RLS.
   - DB changes: None.
   - Prompt guidance: Instruct LLM to preserve headings, list 3 action items, and link each highlight to the source paragraph ID.
   - Acceptance: Human review on 20 lessons; measure factual accuracy and hallucination rate.
   - Timebox: 1–2 days.

3) practice_quiz (Medium priority)
   - Purpose: Generate short quizzes from lesson content and evaluate student answers.
   - Input:
     {
       "lesson_id": "...",
       "question_count": 5,
       "difficulty": "easy|medium|hard",
       "mode": "multiple_choice|short_answer"
     }
   - Response:
     {
       "quiz_id": "...",
       "questions": [ { "id": 1, "type": "mc|short", "stem": "...", "options": [...], "answer": "..." } ]
     }
   - Evaluation endpoint input:
     { "quiz_id":"...", "answers": { "1": "B", "2": "text" } }
   - Evaluation response: { "score": 4, "feedback": { "1": "explain..." } }
   - Auth/RLS: Student-only; store attempts to `practice_quiz_attempts` (migration needed) for progress tracking.
   - Prompt templates: Provide examples for MC and short answer questions; include canonical answer and short rubric for feedback.
   - Timebox: 3–5 days (includes evaluation and storing attempts).

4) submit_exercise & request_feedback (Medium priority)
   - Purpose: Let students submit exercise answers and request AI-assisted feedback; integrate with existing RPCs like `create_exam_submission` and `save_exam_feedback`.
   - Input (submit_exercise): { "exercise_id":"...", "content": "..." }
   - Input (request_feedback): { "submission_id":"...", "level":"brief|detailed" }
   - Response: confirmation and generated feedback object with score/rubric.
   - Auth/RLS: Student only; use student_id from proxy headers; ensure audit log entry for each submission and feedback request.
   - DB changes: none if existing RPCs suffice; otherwise add `exercise_submissions` migration.
   - Timebox: 3–4 days.

5) hint_for_exercise (Medium priority, conservative)
   - Purpose: On demand progressive hints for an exercise. Track hint usage for analytics and potential grade penalties.
   - Input: { "exercise_id":"...", "hint_level": 1 }
   - Response: { "hint": "...", "level": 1 }
   - DB changes: `exercise_hint_usage` (migration) to log usage.
   - Notes: Hints should be gradual; final solution only delivered if explicitly requested.
   - Timebox: 2 days.

6) recommend_next_lessons & create_study_plan (Lower priority)
   - Purpose: Personalized next steps and study schedules based on `get_student_progress` and recent quiz/submission results.
   - Output: ordered lesson list, suggested study windows, calendar export (iCal/webhook).
   - DB changes: optional `study_plans` table.
   - Timebox: 4–7 days (algorithm + UI integration).

Implementation details & developer notes
-------------------------------------

- Tool registration: follow README pattern. Implement each tool in `src/tools/` and register in `src/http-server.ts` using `server.tool('tool-name', 'Desc', schema, handler)`.
- Authorization: Use `AuthManager` and `auth.role` to restrict tools to `student` (or teacher/admin where appropriate). All actions must call `auth.logAction('tool', ...)` for auditability.
- Rate limiting: Maintain existing 100 req/min default; consider lower limits for heavy LLM calls (e.g. 5/min per user) and return HTTP 429 when exceeded.
- Prompts: Add a `src/prompts/study-companion/` folder with templates: `flashcards.md`, `summary.md`, `quiz.md`, `hint.md`. Keep prompts deterministic and include examples to reduce hallucinations.
- Migrations: New tables suggested:
  - `student_flashcard_sets` (id, student_id, lesson_id, title, payload jsonb, created_at)
  - `practice_quiz_attempts` (id, student_id, quiz_id, lesson_id, payload jsonb, score, created_at)
  - `exercise_hint_usage` (id, student_id, exercise_id, hint_level, created_at)
  - `study_plans` (id, student_id, plan jsonb, created_at)

Acceptance criteria (per feature)
-------------------------------
- Tools return valid JSON that matches the declared contract.
- Each tool logs an audit entry in `mcp_audit_log`.
- Student role can call the tools and RLS prevents access to unauthorized content.
- Basic quality check for LLM outputs (manual review) shows <= 10% critical hallucination rate on sample set.

Testing checklist
-----------------
- Unit tests for input validation and error handling.
- Integration test: call tool via HTTP proxy (mimic headers X-User-ID, X-User-Role, X-MCP-Secret) and assert response and audit log entry.
- Manual content QA: sample 20 lessons for flashcards/summary/quiz.

Rollout and monitoring
----------------------
- Launch features behind feature flags. Start with a small pilot group of students.
- Monitor `mcp_audit_log` and `mcp_usage_metrics` (add if needed) for performance and abuse.
- Collect qualitative feedback from students and iterate on prompts.

Suggested 8-week roadmap (high level)
-------------------------------------
- Week 1: Implement `student_summary` and `generate_flashcards` tools + prompt templates + docs.
- Week 2: QA, small pilot, fix prompt issues.
- Week 3: Implement `practice_quiz` with evaluation and attempt storage.
- Week 4: Implement `submit_exercise` + `request_feedback` integration with existing RPCs.
- Week 5: Add `hint_for_exercise` and hint logging.
- Week 6: Implement `recommend_next_lessons` and basic `create_study_plan` export.
- Week 7: Full pilot, analytics collection and iteration.
- Week 8: Production rollout, monitoring, and retrospective.

Appendix — Example prompt snippets
---------------------------------

Flashcards prompt (brief):
"""
You are a helpful study assistant. Create up to {count} flashcards from the following lesson content.
- For each flashcard provide a concise question (front) and a short answer (back).
- Keep answers <= 30 words.
- Preserve link to source paragraph by adding "source_paragraph": <n>.
Content:
{lesson_content}
"""

Quiz generation prompt (brief):
"""
Generate {question_count} questions from the lesson below. For each question include: id, type (multiple_choice|short_answer), stem, options (if multiple_choice), answer, explanation (1-2 sentences).
Make questions focused on key learning outcomes and avoid trivial factual recall.
"""

Next steps
----------
1) I created this plan at `mcp-server/docs/students-features-plan.md`.
2) Tell me which 2 features you want implemented first (I recommend `generate_flashcards` and `practice_quiz`).
3) If you want, I can open PR-ready code stubs for those tools (handlers, prompt files, and a minimal migration) and a small test script to exercise them.
