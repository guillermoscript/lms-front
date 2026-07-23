# Learning Science & AI-Learning Research (July 2026)

Deep-research run: 24 sources fetched → 117 claims extracted → top 25 adversarially verified (3 independent votes each) → 10 confirmed, 15 refuted. Confirmed findings below are cited; refuted claims are listed so we never accidentally build on them.

## Verified findings (survived 3-vote adversarial verification)

### 1. FSRS > SM-2 for flashcard scheduling — HIGH confidence (3-0, 3-0, 3-0)
FSRS is machine-learning-fit to each user's review history (three-component model: Retrievability, Stability, Difficulty), lets users set a target retention rate instead of tuning parameters, needs **fewer reviews for the same retention**, and handles late/delayed reviews much better than SM-2. Anki ships FSRS alongside SM-2 since v23.10 and recommends it. Corroborated by benchmarks over 350–500M reviews (~20–30% fewer reviews at equal retention).
Source: https://faqs.ankiweb.net/what-spaced-repetition-algorithm
⚠️ The specific FSRS-7 log-loss/AUC numbers from the open-spaced-repetition GitHub benchmark did NOT survive verification — cite the qualitative advantage, not those metrics.

### 2. Guardrailed AI tutoring ≫ open chatbot access; open access can HARM learning — HIGH confidence (3-0)
PNAS RCT (Bastani et al. 2025, ~1,000 high-schoolers): guardrailed "GPT Tutor" (teacher-designed hints, **no answer-giving**) improved assisted practice +127% vs +48% for vanilla GPT-4 — and vanilla-GPT students did WORSE than no-AI controls on the later unassisted exam (over-reliance/crutch effect).
Source: https://www.pnas.org/doi/10.1073/pnas.2422633122
Design rule: the tutor must scaffold, never hand out full solutions.

### 3. Quizzes interpolated inside video lectures improve learning — HIGH confidence (2-1)
Preregistered RCT, N=703 across 7 institutions (Communications Psychology 2025): retrieval-practice quizzes between video segments improved next-segment test performance (d≈0.23–0.24, p=0.002).
Source: https://www.nature.com/articles/s44271-025-00234-5
⚠️ The 24-hour durable-retention version of this claim was refuted (1-2) — claim immediate/within-session benefit only.

### 4. Interleaving is NOT a universal win — HIGH confidence (3-0)
RCT with low-achieving learners (Language Learning 2025): pure interleaved practice acted as an UNdesirable difficulty for novices/low performers in early skill acquisition.
Source: https://onlinelibrary.wiley.com/doi/10.1111/lang.12659
⚠️ The tempting "block first, then interleave" prescription did NOT survive verification (1-2 / 0-3). Safe takeaway: don't force interleaving on struggling students early; gate it on initial mastery.

### 5. Retention gamification (leaderboards, streak/habit mechanics) is the top engagement lever — MEDIUM confidence (3-0, 3-0)
Duolingo first-party data (ex-CPO): leaderboards lifted total learning time +17% and tripled highly-engaged users; their growth model found the current-user retention metric (CURR) had 5x the DAU impact of the next-best lever.
Source: https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth
⚠️ Historical (~2018) case study, not a 2026 experiment. The "+21% CURR from streak-saver notifications" and "4.5x DAU" figures were refuted — don't cite them.

### 6. In video: embedded prompts/questions help; talking heads & subtitles don't move learning — MEDIUM confidence (3-0 / 2-1)
Learning and Instruction 2025 special issue (6 empirical studies): deeper-processing prompts/questions in or around video → positive learning outcomes; talking heads and subtitles → no significant gains. Engagement/motivation improvements did NOT translate into learning gains.
Source: https://www.sciencedirect.com/science/article/pii/S0959475224002044
⚠️ Scoped to those six studies; broader meta-analyses show small positive instructor-presence effects. Read as "invest in embedded questions, not production polish."

## Notable claims collected but NOT verified (didn't make the top-25 verify cut — treat as leads, not evidence)
- Harvard/Kestin RCT 2025: custom scaffolded AI tutor (PS2 Pal) → 0.73–1.3 SD gains, > active-learning classroom, in less time. Effectiveness attributed to pedagogy engineering (no direct answers, pre-written step-by-step solutions to control hallucination).
- World Bank Nigeria RCT 2025: 6-week teacher-facilitated GPT-4 tutoring → +0.31 SD overall / +0.23 SD English; equivalent to 1.5–2 years of schooling; benefits skewed to higher-baseline students.
- UCLA physics (npj Sci. Learning): interleaving homework → d=0.40–0.91 on delayed tests at zero extra study time; students falsely believe they learn less from it.
- Math Academy mechanics: knowledge graph + mastery gates + FIRe (implicit repetition credit trickles down to prerequisites) + diagnostic "knowledge frontier" + quizzes targeted at ~80% expected success.
- Duolingo Birdbrain: IRT/Elo-style logistic model → LSTM knowledge tracing (40-dim learner vector) driving exercise selection; A/B-verified engagement AND learning lifts. Sessions 3–5 min, 8–10 varied parts.
- Health-professions systematic review: retrieval practice beats restudy in 43/63 experiments; short-answer/free-recall beats MCQ; expanding schedules beat fixed; mandatory practice beats optional.
- Spacing caveats: 2024 nine-course STEM study — spacing effects are fragile in real classrooms (significant in only 2/9 courses); 2025 math meta-analysis — spacing g=0.28, retrieval g=0.18 (CI crosses zero) in math. Effects are domain-dependent; MCQ-with-minimal-feedback implementations are where spacing fails.
- AI audio overviews (NotebookLM-style): the entire thread was refuted/unproven — no learning-outcome evidence yet. Deprioritize as a learning feature; if shipped, position as intro-level supplement with teacher review/approval.

## Prioritized roadmap for this LMS (evidence strength × effort)

Already shipped here (keep): SM-2 flashcards, Socratic tutor w/ session memory, practice attempts + weak spots, exam readiness score, weekly study plans, streaks/XP/achievements, teacher confusion hotspots.

| # | Move | Type | Evidence | Effort | Maps to |
|---|------|------|----------|--------|---------|
| 1 | **Upgrade SM-2 → FSRS** (use `ts-fsrs` npm; keep `review_cards` schema, add stability/difficulty/retrievability cols; per-user optimization later) | Upgrade | High | Low-Med | `review_cards`, `lms_grade_review` |
| 2 | **Embedded questions in lesson video** (question markers at segment boundaries in the Video MDX component; pause → MCQ/short-answer → record as practice_attempt) | Add | High | Med | lessons, `practice_attempts` |
| 3 | **Audit tutor guardrails vs answer-giving** (never emit full solutions; hint ladder; ground on teacher content; log + surface over-reliance patterns) | Upgrade | High | Low | AI tutor, MCP tutor prompts |
| 4 | **Mastery-gated interleaving in practice** (blocked practice until topic ≥ threshold, then mix due topics into interleaved sessions; explain "why mixed" to students) | Add | High (direction) | Med | practice quiz engine, exam-readiness |
| 5 | **Leaderboards/leagues + streak-saver mechanics** (tenant-scoped weekly leagues on existing `leaderboard_cache`; streak-repair item in store) | Upgrade | Med | Med | gamification tables |
| 6 | **Prefer generative retrieval formats** (short-answer/fill-in over MCQ where AI-gradable; mandatory not optional practice in study plans) | Upgrade | Med | Low | exercises, study_goals |
| 7 | **Prerequisite knowledge graph + mastery gates per course** (lesson/topic prerequisites; `require_sequential_completion` generalized to mastery %, Math Academy-style) | Add | Med (app precedent) | High | courses/lessons schema |
| 8 | **Simple Elo/IRT item difficulty + adaptive selection** (per-question Elo from practice_attempts; select next questions near ~80% expected success) | Add | Med | Med-High | practice engine |
| 9 | AI audio overviews of lessons | Add | **Weak/unproven** | Med | defer or ship as teacher-approved supplement only |

Quick wins first: #1, #3, #6 are days-not-weeks; #2 and #4 are the highest-value medium builds.
