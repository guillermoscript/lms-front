-- Issue #696 — a course with lessons but no exams must be able to earn a
-- certificate. `calculate_course_completion()` used to return `eligible: null`
-- for such a course, because BOOL_AND()/AVG() over zero exam rows is NULL and
-- three-valued logic collapsed the whole verdict.
--
-- Runs entirely inside a transaction that is rolled back, so it leaves the
-- seeded database untouched.
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off \
--     < tests/sql/issue-696-lessons-only-certificate.sql
--
-- Uses Default School and the seeded student. Each assertion RAISEs on failure
-- and the script ends with a `PASS:` notice.
begin;

-- Fixture courses would otherwise trip the free plan's course cap (#658).
set local app.bypass_plan_limits = 'on';

do $$
declare
  v_tenant    constant uuid := '00000000-0000-0000-0000-000000000001';
  v_student   constant uuid := 'a1000000-0000-0000-0000-000000000001'; -- student@e2etest.com
  v_author    uuid;
  v_course_a  int;   -- lessons only
  v_course_b  int;   -- lessons + exam
  v_course_c  int;   -- nothing published
  v_lesson_a1 bigint;
  v_lesson_a2 bigint;
  v_lesson_b1 bigint;
  v_exam_b    int;
  v_submission int;
  v_res       jsonb;
  v_certs     int;
begin
  -- ── fixtures ──────────────────────────────────────────────────────────────
  select user_id into v_author from tenant_users
   where tenant_id = v_tenant and role in ('admin','teacher') and status = 'active' limit 1;
  if v_author is null then raise exception 'fixture: no staff member in Default School'; end if;

  -- Course A: two published lessons, no exams at all.
  insert into courses (title, author_id, tenant_id, status)
  values ('696 lessons-only course', v_author, v_tenant, 'published')
  returning course_id into v_course_a;

  insert into lessons (course_id, tenant_id, title, sequence, status)
  values (v_course_a, v_tenant, '696 A lesson 1', 1, 'published') returning id into v_lesson_a1;
  insert into lessons (course_id, tenant_id, title, sequence, status)
  values (v_course_a, v_tenant, '696 A lesson 2', 2, 'published') returning id into v_lesson_a2;

  insert into certificate_templates (course_id, tenant_id, template_name, is_active)
  values (v_course_a, v_tenant, '696 template A', true);

  -- ── 1. no lessons completed yet: not eligible, and an actual boolean ──────
  v_res := calculate_course_completion(v_student, v_course_a);
  if jsonb_typeof(v_res->'eligible') <> 'boolean' then
    raise exception '§1 eligible is %, expected a boolean (payload: %)',
      jsonb_typeof(v_res->'eligible'), v_res;
  end if;
  if (v_res->>'eligible')::boolean then
    raise exception '§1 a course with zero lessons completed must not be eligible (payload: %)', v_res;
  end if;

  -- ── 2. half the lessons done: still not eligible ──────────────────────────
  insert into lesson_completions (user_id, lesson_id) values (v_student, v_lesson_a1);
  v_res := calculate_course_completion(v_student, v_course_a);
  if (v_res->>'eligible')::boolean is not false then
    raise exception '§2 50%% lesson completion must not be eligible (payload: %)', v_res;
  end if;
  if (v_res->>'completionPercentage')::numeric <> 50 then
    raise exception '§2 expected completionPercentage 50, got % (payload: %)',
      v_res->>'completionPercentage', v_res;
  end if;

  -- ── 3. THE REGRESSION: all lessons done, no exams ⇒ eligible ──────────────
  insert into lesson_completions (user_id, lesson_id) values (v_student, v_lesson_a2);
  v_res := calculate_course_completion(v_student, v_course_a);
  if jsonb_typeof(v_res->'eligible') <> 'boolean' then
    raise exception '§3 eligible is % — this is the #696 regression (payload: %)',
      jsonb_typeof(v_res->'eligible'), v_res;
  end if;
  if not (v_res->>'eligible')::boolean then
    raise exception '§3 a fully completed lessons-only course must be eligible (payload: %)', v_res;
  end if;
  if (v_res->>'totalExams')::int <> 0 then
    raise exception '§3 fixture drift: course A should have no exams (payload: %)', v_res;
  end if;

  -- ── 4. the lesson-completion trigger actually issued the certificate ──────
  select count(*) into v_certs
  from certificates where user_id = v_student and course_id = v_course_a and revoked_at is null;
  if v_certs <> 1 then
    raise exception '§4 expected exactly 1 auto-issued certificate for the lessons-only course, got %', v_certs;
  end if;

  -- ── 5. NULL template thresholds still produce a boolean verdict ───────────
  update certificate_templates
     set min_lesson_completion_pct = null,
         min_exam_pass_score = null,
         requires_all_exams = null
   where course_id = v_course_a;
  v_res := calculate_course_completion(v_student, v_course_a);
  if jsonb_typeof(v_res->'eligible') <> 'boolean' then
    raise exception '§5 NULL template thresholds must not produce a null verdict (payload: %)', v_res;
  end if;
  if not (v_res->>'eligible')::boolean then
    raise exception '§5 NULL thresholds should fall back to the defaults and stay eligible (payload: %)', v_res;
  end if;

  -- ── 6. a course WITH an exam is unchanged: unpassed exam ⇒ not eligible ───
  insert into courses (title, author_id, tenant_id, status)
  values ('696 course with exam', v_author, v_tenant, 'published')
  returning course_id into v_course_b;

  insert into lessons (course_id, tenant_id, title, sequence, status)
  values (v_course_b, v_tenant, '696 B lesson 1', 1, 'published') returning id into v_lesson_b1;

  insert into exams (course_id, tenant_id, title, duration, status, created_by)
  values (v_course_b, v_tenant, '696 B exam', 60, 'published', v_author)
  returning exam_id into v_exam_b;

  insert into certificate_templates (course_id, tenant_id, template_name, is_active, min_exam_pass_score)
  values (v_course_b, v_tenant, '696 template B', true, 70);

  insert into lesson_completions (user_id, lesson_id) values (v_student, v_lesson_b1);

  v_res := calculate_course_completion(v_student, v_course_b);
  if (v_res->>'eligible')::boolean is not false then
    raise exception '§6 lessons done but exam unsubmitted must not be eligible (payload: %)', v_res;
  end if;

  -- a submitted-but-failed exam is still not eligible
  insert into exam_submissions (exam_id, student_id, tenant_id)
  values (v_exam_b, v_student, v_tenant) returning submission_id into v_submission;
  insert into exam_scores (submission_id, student_id, exam_id, score)
  values (v_submission, v_student, v_exam_b, 40);

  v_res := calculate_course_completion(v_student, v_course_b);
  if (v_res->>'eligible')::boolean is not false then
    raise exception '§6 a failed exam must not be eligible (payload: %)', v_res;
  end if;

  -- ── 7. …and a passed exam with all lessons done IS eligible ───────────────
  update exam_scores set score = 90 where submission_id = v_submission;
  v_res := calculate_course_completion(v_student, v_course_b);
  if not (v_res->>'eligible')::boolean then
    raise exception '§7 passed exam + complete lessons must be eligible (payload: %)', v_res;
  end if;

  -- ── 8. a course with nothing published is never eligible ──────────────────
  insert into courses (title, author_id, tenant_id, status)
  values ('696 empty course', v_author, v_tenant, 'published')
  returning course_id into v_course_c;

  insert into certificate_templates (course_id, tenant_id, template_name, is_active, min_lesson_completion_pct)
  values (v_course_c, v_tenant, '696 template C', true, 0);

  v_res := calculate_course_completion(v_student, v_course_c);
  if jsonb_typeof(v_res->'eligible') <> 'boolean' then
    raise exception '§8 empty course must return a boolean verdict (payload: %)', v_res;
  end if;
  if (v_res->>'eligible')::boolean then
    raise exception '§8 a course with no published lessons or exams must never be eligible (payload: %)', v_res;
  end if;

  raise notice 'PASS: #696 — lessons-only courses are certificate-eligible, exam courses and empty courses unchanged';
end $$;

rollback;
