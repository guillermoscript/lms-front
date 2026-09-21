-- #829: closed-question answer keys never sit in exercises.exercise_config.
-- Run with `supabase test db` against a seeded local stack (supabase/seed.sql:
-- student a1…01 is entitled to course 1001 in the default tenant, owner a1…02
-- is its admin). Everything rolls back.
BEGIN;
SELECT plan(14);

INSERT INTO public.exercises (course_id, tenant_id, title, instructions, exercise_type, difficulty_level, status, created_by, exercise_config)
VALUES (1001, '00000000-0000-0000-0000-000000000001', 'pgtap answer keys', 'Answer', 'quiz', 'easy', 'published',
        'a1000000-0000-0000-0000-000000000002',
        '{"passing_score":50,"questions":[
           {"id":"q1","type":"multiple_choice","prompt":"2+2?","options":["3","4"],"correctIndex":1,"explanation":"math"},
           {"id":"q2","type":"true_false","prompt":"Sky is blue","correctAnswer":true},
           {"id":"q3","type":"fill_in_the_blank","prompt":"Capital of France","acceptedAnswers":["Paris"]}]}');

CREATE TEMP TABLE t AS SELECT max(id) AS id FROM public.exercises WHERE title = 'pgtap answer keys';
GRANT SELECT ON t TO authenticated;

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.exercises e, jsonb_array_elements(e.exercise_config -> 'questions') q
    WHERE e.id = (SELECT id FROM t)
      AND q ?| ARRAY['correctIndex', 'correctAnswer', 'acceptedAnswers', 'explanation']
  ),
  'insert strips every answer field from exercise_config'
);
SELECT is(
  (SELECT questions FROM public.exercise_answer_keys WHERE exercise_id = (SELECT id FROM t)),
  '{"q1":{"correctIndex":1,"explanation":"math"},"q2":{"correctAnswer":true},"q3":{"acceptedAnswers":["Paris"]}}'::jsonb,
  'insert moves the answers into exercise_answer_keys'
);

-- A client that loaded the stripped config and saves it back keeps the key.
UPDATE public.exercises SET exercise_config = exercise_config WHERE id = (SELECT id FROM t);
SELECT is(
  (SELECT questions -> 'q1' FROM public.exercise_answer_keys WHERE exercise_id = (SELECT id FROM t)),
  '{"correctIndex":1,"explanation":"math"}'::jsonb,
  'saving the stripped config back keeps the key'
);

-- An edit that carries answers replaces that question's entry; a removed
-- question's entry is dropped.
UPDATE public.exercises
SET exercise_config = '{"passing_score":50,"questions":[
      {"id":"q1","type":"multiple_choice","prompt":"2+2?","options":["3","4","5"],"correctIndex":2},
      {"id":"q2","type":"true_false","prompt":"Sky is blue"}]}'
WHERE id = (SELECT id FROM t);
SELECT is(
  (SELECT questions FROM public.exercise_answer_keys WHERE exercise_id = (SELECT id FROM t)),
  '{"q1":{"correctIndex":2},"q2":{"correctAnswer":true}}'::jsonb,
  'edited question replaced, untouched kept, removed dropped'
);

-- Restore the three-question key for the grading checks below.
UPDATE public.exercises
SET exercise_config = '{"passing_score":50,"questions":[
      {"id":"q1","type":"multiple_choice","prompt":"2+2?","options":["3","4"],"correctIndex":1,"explanation":"math"},
      {"id":"q2","type":"true_false","prompt":"Sky is blue","correctAnswer":true},
      {"id":"q3","type":"fill_in_the_blank","prompt":"Capital of France","acceptedAnswers":["Paris"]}]}'
WHERE id = (SELECT id FROM t);

-- ── as the student ──
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000001"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.exercises WHERE id = (SELECT id FROM t)), 1,
  'student can still read the exercise'
);
SELECT ok(
  (SELECT exercise_config::text FROM public.exercises WHERE id = (SELECT id FROM t)) NOT LIKE '%correct%',
  'student sees no answers in exercise_config'
);
SELECT is((SELECT count(*)::int FROM public.exercise_answer_keys), 0, 'student reads no answer keys');

SELECT is(
  (SELECT public.grade_exercise_answers((SELECT id FROM t),
     '[{"questionId":"q1","value":1},{"questionId":"q2","value":false},{"questionId":"q3","value":"  PARIS "}]') - 'perQuestion'),
  '{"score":67,"correctCount":2,"total":3,"passingScore":50,"passed":true}'::jsonb,
  'grade_exercise_answers grades like gradeCheckpointQuestions'
);
SELECT is(
  (SELECT public.grade_exercise_answers((SELECT id FROM t), '[{"questionId":"q1","value":1}]') -> 'perQuestion' -> 0),
  '{"questionId":"q1","correct":true,"correctValue":"4","explanation":"math"}'::jsonb,
  'per-question result carries correctValue and explanation'
);
SELECT is(
  (SELECT public.grade_exercise_answers((SELECT id FROM t), '[]') ->> 'score'), '0',
  'unanswered questions count as wrong'
);
SELECT throws_ok(
  $$ SELECT public.grade_exercise_answers(2004, '[]') $$,
  'P0002', 'exercise_not_found',
  'an exercise in another school is not found'
);

RESET ROLE;
INSERT INTO public.lesson_checkpoints (tenant_id, lesson_id, exercise_id, placement_type, content_block_id, is_enabled, created_by)
SELECT '00000000-0000-0000-0000-000000000001', l.id, (SELECT id FROM t), 'inline', 'pgtap-block', true, 'a1000000-0000-0000-0000-000000000002'
FROM public.lessons l WHERE l.course_id = 1001 ORDER BY l.id LIMIT 1;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000001"}', true);
SELECT throws_ok(
  format($$ SELECT public.grade_exercise_answers(%s, '[]') $$, (SELECT id FROM t)),
  '42501', 'exercise_is_lesson_checkpoint',
  'a student cannot grade a lesson-checkpoint exercise outside the lesson'
);

-- ── as the school admin ──
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000001"}', true);
SELECT is(
  (SELECT questions -> 'q2' FROM public.exercise_answer_keys WHERE exercise_id = (SELECT id FROM t)),
  '{"correctAnswer":true}'::jsonb,
  'staff read the key'
);

-- ── as anon ──
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT count(*) FROM public.exercise_answer_keys $$,
  '42501', NULL,
  'anon has no grant on the key table'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
