-- Issue #871 — real learning events write milestone posts into the community.
--
-- Runs entirely inside a transaction that is rolled back, so it leaves the
-- seeded database untouched.
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off \
--     -v ON_ERROR_STOP=1 < tests/sql/issue-871-community-milestones.sql
--
-- Uses Code Academy (plan with the community), Alice (its student) and the
-- creator (its admin); Default School (no community) for the plan gate. Each
-- assertion RAISEs on failure and every section ends with a `PASS:` notice.
begin;

-- Fixture courses would otherwise trip the free plan's course cap (#658).
set local app.bypass_plan_limits = 'on';

-- ── helpers (session-temporary) ─────────────────────────────────────────────

-- A published course with N published lessons and M published exams, an
-- optional active template, and an optional admin_grant entitlement.
create function pg_temp.t871_course(
  _tenant uuid, _title text, _lessons int, _exams int, _template boolean, _entitle uuid
) returns int language plpgsql as $$
declare
  v_course int;
  v_author uuid;
begin
  select user_id into v_author from public.tenant_users
   where tenant_id = _tenant and role in ('admin', 'teacher') and status = 'active' limit 1;
  insert into public.courses (title, author_id, tenant_id, status)
  values (_title, v_author, _tenant, 'published') returning course_id into v_course;
  for i in 1.._lessons loop
    insert into public.lessons (course_id, tenant_id, title, sequence, status)
    values (v_course, _tenant, _title || ' lesson ' || i, i, 'published');
  end loop;
  for i in 1.._exams loop
    insert into public.exams (course_id, tenant_id, title, duration, status, created_by)
    values (v_course, _tenant, _title || ' exam ' || i, 60, 'published', v_author);
  end loop;
  if _template then
    insert into public.certificate_templates (course_id, tenant_id, template_name, is_active)
    values (v_course, _tenant, _title || ' template', true);
  end if;
  if _entitle is not null then
    insert into public.entitlements (user_id, course_id, tenant_id, source_type)
    values (_entitle, v_course, _tenant, 'admin_grant');
  end if;
  return v_course;
end $$;

create function pg_temp.t871_lesson(_course int, _n int) returns bigint language sql as $$
  select id from public.lessons where course_id = _course and sequence = _n
$$;

create function pg_temp.t871_exam(_course int) returns int language sql as $$
  select exam_id from public.exams where course_id = _course order by exam_id limit 1
$$;

create function pg_temp.t871_complete(_user uuid, _course int, _n int) returns void language sql as $$
  insert into public.lesson_completions (user_id, lesson_id) values (_user, pg_temp.t871_lesson(_course, _n))
$$;

-- A scored attempt: submission + exam_scores row.
create function pg_temp.t871_score(_user uuid, _course int, _score numeric) returns int language plpgsql as $$
declare
  v_exam int := pg_temp.t871_exam(_course);
  v_tenant uuid;
  v_sub int;
begin
  select tenant_id into v_tenant from public.courses where course_id = _course;
  insert into public.exam_submissions (exam_id, student_id, tenant_id)
  values (v_exam, _user, v_tenant) returning submission_id into v_sub;
  insert into public.exam_scores (submission_id, student_id, exam_id, score)
  values (v_sub, _user, v_exam, _score);
  return v_sub;
end $$;

-- Milestone posts of one type by one author in one feed (NULL = school feed).
create function pg_temp.t871_posts(_author uuid, _type text, _course int) returns int language sql as $$
  select count(*)::int from public.community_posts
  where author_id = _author and post_type = 'milestone' and milestone_type = _type
    and course_id is not distinct from _course
$$;

-- School-feed milestones of one type and value.
create function pg_temp.t871_school(_author uuid, _type text, _value int) returns int language sql as $$
  select count(*)::int from public.community_posts
  where author_id = _author and post_type = 'milestone' and milestone_type = _type
    and course_id is null
    and milestone_data ->> (case _type when 'level_up' then 'level' else 'days' end) = _value::text
$$;

-- Plain completion vs the certificate rule with a default (100/70/all) template.
create function pg_temp.t871_parity(_user uuid, _course int) returns boolean language plpgsql as $$
declare
  v_plain boolean := public.is_course_complete(_user, _course);
  v_calc boolean;
  v_templated boolean;
  v_template uuid;
begin
  insert into public.certificate_templates
    (course_id, tenant_id, template_name, is_active, min_lesson_completion_pct, min_exam_pass_score, requires_all_exams)
  select _course, c.tenant_id, '871 parity template', true, 100, 70, true
  from public.courses c where c.course_id = _course
  returning template_id into v_template;
  v_calc := coalesce((public.calculate_course_completion(_user, _course) ->> 'eligible')::boolean, false);
  v_templated := public.is_course_complete(_user, _course);
  delete from public.certificate_templates where template_id = v_template;
  if v_plain is distinct from v_calc or v_templated is distinct from v_calc then
    raise exception 'parity drift on course %: plain % / templated % / calculate_course_completion %',
      _course, v_plain, v_templated, v_calc;
  end if;
  return v_calc;
end $$;

-- ── fixtures ────────────────────────────────────────────────────────────────
do $$
declare
  v_ca    constant uuid := '00000000-0000-0000-0000-000000000002';
  v_alice constant uuid := 'a1000000-0000-0000-0000-000000000004';
begin
  if not public.community_enabled(v_ca) then
    raise exception 'fixture: Code Academy must be on a plan with the community';
  end if;
  -- Nothing from an earlier run or the seed may interfere.
  delete from public.community_posts where author_id = v_alice and post_type = 'milestone';
  delete from public.tenant_settings where tenant_id = v_ca and setting_key = 'community_milestone_posts';
  delete from public.community_user_mutes where tenant_id = v_ca and user_id = v_alice;
  update public.profiles set share_milestones = true where id = v_alice;

  perform set_config('t871.a', pg_temp.t871_course(v_ca, '871 A lessons and exam', 2, 1, false, v_alice)::text, true);
  perform set_config('t871.b', pg_temp.t871_course(v_ca, '871 B lessons only', 2, 0, false, v_alice)::text, true);
  perform set_config('t871.c', pg_temp.t871_course(v_ca, '871 C exam via service role', 1, 1, false, v_alice)::text, true);
end $$;

-- ── 1. a course completes only when its last requirement lands ──────────────
do $$
declare
  v_alice constant uuid := 'a1000000-0000-0000-0000-000000000004';
  v_a int := current_setting('t871.a')::int;
  v_sub int;
  v_post record;
begin
  perform pg_temp.t871_complete(v_alice, v_a, 1);
  if pg_temp.t871_posts(v_alice, 'course_completion', v_a) <> 0 then
    raise exception '§1 half the lessons must not announce a completion';
  end if;

  perform pg_temp.t871_complete(v_alice, v_a, 2);
  if pg_temp.t871_posts(v_alice, 'course_completion', v_a) <> 0 then
    raise exception '§1 all lessons but an unsat exam must not announce a completion';
  end if;

  v_sub := pg_temp.t871_score(v_alice, v_a, 60);
  if pg_temp.t871_posts(v_alice, 'course_completion', v_a) <> 0 then
    raise exception '§1 a failed exam (60) must not announce a completion';
  end if;

  update public.exam_scores set score = 80 where submission_id = v_sub;
  if pg_temp.t871_posts(v_alice, 'course_completion', v_a) <> 1 then
    raise exception '§1 the passing score must announce exactly one completion, got %',
      pg_temp.t871_posts(v_alice, 'course_completion', v_a);
  end if;

  select * into v_post from public.community_posts
   where author_id = v_alice and milestone_type = 'course_completion' and course_id = v_a;
  if v_post.milestone_data ->> 'course_title' <> '871 A lessons and exam'
     or (v_post.milestone_data ->> 'course_id')::int <> v_a
     or v_post.content <> ''
     or v_post.tenant_id <> '00000000-0000-0000-0000-000000000002' then
    raise exception '§1 unexpected completion post: % / content %', v_post.milestone_data, v_post.content;
  end if;
  raise notice 'PASS: §1 completion waits for the last lesson and the passing score';
end $$;

-- ── 2. the last lesson, completed through RLS, announces once ──────────────
do $$
begin
  perform pg_temp.t871_complete('a1000000-0000-0000-0000-000000000004', current_setting('t871.b')::int, 1);
  perform set_config('t871.b2', pg_temp.t871_lesson(current_setting('t871.b')::int, 2)::text, true);
end $$;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000002","tenant_role":"student"}', true); end $$;
insert into public.lesson_completions (user_id, lesson_id)
values ('a1000000-0000-0000-0000-000000000004', current_setting('t871.b2')::bigint);
reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

do $$
declare
  v_alice constant uuid := 'a1000000-0000-0000-0000-000000000004';
  v_b int := current_setting('t871.b')::int;
begin
  if pg_temp.t871_posts(v_alice, 'course_completion', v_b) <> 1 then
    raise exception '§2 the last lesson through RLS must announce exactly one completion, got %',
      pg_temp.t871_posts(v_alice, 'course_completion', v_b);
  end if;

  -- Uncomplete and complete again: still one.
  delete from public.lesson_completions where user_id = v_alice and lesson_id = pg_temp.t871_lesson(v_b, 2);
  perform pg_temp.t871_complete(v_alice, v_b, 2);
  if pg_temp.t871_posts(v_alice, 'course_completion', v_b) <> 1 then
    raise exception '§2 recompleting must not announce again, got %', pg_temp.t871_posts(v_alice, 'course_completion', v_b);
  end if;
  raise notice 'PASS: §2 last lesson through RLS announces once, recompletion does not repeat';
end $$;

-- ── 3. the exam path, scored as service_role, survives the REVOKEs ──────────
do $$
declare
  v_c int := current_setting('t871.c')::int;
  v_sub int;
begin
  perform pg_temp.t871_complete('a1000000-0000-0000-0000-000000000004', v_c, 1);
  insert into public.exam_submissions (exam_id, student_id, tenant_id)
  values (pg_temp.t871_exam(v_c), 'a1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002')
  returning submission_id into v_sub;
  perform set_config('t871.c_sub', v_sub::text, true);
  perform set_config('t871.c_exam', pg_temp.t871_exam(v_c)::text, true);
end $$;

set local role service_role;
insert into public.exam_scores (submission_id, student_id, exam_id, score)
values (current_setting('t871.c_sub')::int, 'a1000000-0000-0000-0000-000000000004', current_setting('t871.c_exam')::int, 90);
reset role;

do $$
begin
  if pg_temp.t871_posts('a1000000-0000-0000-0000-000000000004', 'course_completion', current_setting('t871.c')::int) <> 1 then
    raise exception '§3 a score written by service_role must announce the completion';
  end if;
  raise notice 'PASS: §3 the exam path announces through the definer triggers';
end $$;

-- ── 4. certificates: fold, separate post, once, forgery and access guards ──
do $$
declare
  v_ca    constant uuid := '00000000-0000-0000-0000-000000000002';
  v_alice constant uuid := 'a1000000-0000-0000-0000-000000000004';
  v_d int := pg_temp.t871_course(v_ca, '871 D templated', 2, 0, true, v_alice);
  v_f int := pg_temp.t871_course(v_ca, '871 F template later', 2, 0, false, v_alice);
  v_g int := pg_temp.t871_course(v_ca, '871 G not completed', 2, 0, true, v_alice);
  v_e int := pg_temp.t871_course(v_ca, '871 E no access', 1, 0, true, null);
  v_n int;
begin
  -- Fold: the last lesson completes the course AND issues the certificate.
  perform pg_temp.t871_complete(v_alice, v_d, 1);
  perform pg_temp.t871_complete(v_alice, v_d, 2);
  select count(*) into v_n from public.certificates where user_id = v_alice and course_id = v_d and revoked_at is null;
  if v_n <> 1 then raise exception '§4 fixture: the certificate should auto-issue, got %', v_n; end if;
  if pg_temp.t871_posts(v_alice, 'course_completion', v_d) <> 1
     or pg_temp.t871_posts(v_alice, 'certificate', v_d) <> 0 then
    raise exception '§4 fold: expected 1 completion and 0 certificate posts, got % / %',
      pg_temp.t871_posts(v_alice, 'course_completion', v_d), pg_temp.t871_posts(v_alice, 'certificate', v_d);
  end if;
  if not exists (
    select 1 from public.community_posts
    where author_id = v_alice and milestone_type = 'course_completion' and course_id = v_d
      and milestone_data ->> 'certificate' = 'true'
  ) then
    raise exception '§4 fold: the completion post must carry certificate:true';
  end if;

  -- Re-issued after a fold: announced once already.
  update public.certificates set revoked_at = now() where user_id = v_alice and course_id = v_d;
  perform public.issue_certificate_if_eligible(v_alice, v_d);
  if pg_temp.t871_posts(v_alice, 'certificate', v_d) <> 0 then
    raise exception '§4 a certificate re-issued after the fold must not post';
  end if;

  -- An older completion, then a certificate: a separate post, once.
  perform pg_temp.t871_complete(v_alice, v_f, 1);
  perform pg_temp.t871_complete(v_alice, v_f, 2);
  if pg_temp.t871_posts(v_alice, 'course_completion', v_f) <> 1 then
    raise exception '§4 fixture: F completion should announce';
  end if;
  update public.community_posts set created_at = now() - interval '1 day'
   where author_id = v_alice and milestone_type = 'course_completion' and course_id = v_f;
  insert into public.certificate_templates (course_id, tenant_id, template_name, is_active)
  values (v_f, v_ca, '871 F template', true);
  perform public.issue_certificate_if_eligible(v_alice, v_f);
  if pg_temp.t871_posts(v_alice, 'certificate', v_f) <> 1 then
    raise exception '§4 a certificate after an older completion must post separately, got %',
      pg_temp.t871_posts(v_alice, 'certificate', v_f);
  end if;
  if exists (
    select 1 from public.community_posts
    where author_id = v_alice and milestone_type = 'course_completion' and course_id = v_f
      and milestone_data ? 'certificate'
  ) then
    raise exception '§4 an older completion post must not be folded';
  end if;
  update public.certificates set revoked_at = now() where user_id = v_alice and course_id = v_f;
  perform public.issue_certificate_if_eligible(v_alice, v_f);
  if pg_temp.t871_posts(v_alice, 'certificate', v_f) <> 1 then
    raise exception '§4 a second certificate must not post again';
  end if;

  -- A certificate row for a course Alice has not completed (what a student
  -- can insert through RLS): no post.
  perform pg_temp.t871_complete(v_alice, v_g, 1);
  insert into public.certificates (user_id, course_id, tenant_id, verification_code, credential_json, completion_data)
  values (v_alice, v_g, v_ca, 'T871' || substr(md5(random()::text), 1, 20), '{}'::jsonb, '{}'::jsonb);
  if pg_temp.t871_posts(v_alice, 'certificate', v_g) <> 0 or pg_temp.t871_posts(v_alice, 'course_completion', v_g) <> 0 then
    raise exception '§4 a forged certificate must not post';
  end if;

  -- A course Alice cannot access: the certificate issues, nothing posts.
  perform pg_temp.t871_complete(v_alice, v_e, 1);
  select count(*) into v_n from public.certificates where user_id = v_alice and course_id = v_e;
  if v_n <> 1 then raise exception '§4 fixture: E certificate should issue (the path ran), got %', v_n; end if;
  if exists (select 1 from public.community_posts where author_id = v_alice and course_id = v_e) then
    raise exception '§4 a course without access must not post';
  end if;

  perform set_config('t871.e', v_e::text, true);
  raise notice 'PASS: §4 certificate fold, separate post, once, forgery and access guards';
end $$;

-- ── 5. level up: from level 5, once per level, jumps land where they land ──
do $$
declare
  v_ca    constant uuid := '00000000-0000-0000-0000-000000000002';
  v_alice constant uuid := 'a1000000-0000-0000-0000-000000000004';
  v_post record;
begin
  delete from public.community_posts
   where author_id = v_alice and tenant_id = v_ca and post_type = 'milestone' and course_id is null;

  update public.gamification_profiles set level = 4 where user_id = v_alice and tenant_id = v_ca;
  update public.gamification_profiles set level = 5 where user_id = v_alice and tenant_id = v_ca;
  if pg_temp.t871_school(v_alice, 'level_up', 5) <> 1 then
    raise exception '§5 4 -> 5 must announce level 5';
  end if;
  select * into v_post from public.community_posts
   where author_id = v_alice and milestone_type = 'level_up' and milestone_data ->> 'level' = '5';
  if v_post.course_id is not null or v_post.milestone_data <> '{"level": 5}'::jsonb or v_post.tenant_id <> v_ca then
    raise exception '§5 unexpected level post: % course %', v_post.milestone_data, v_post.course_id;
  end if;

  update public.gamification_profiles set level = 4 where user_id = v_alice and tenant_id = v_ca;
  update public.gamification_profiles set level = 5 where user_id = v_alice and tenant_id = v_ca;
  if pg_temp.t871_school(v_alice, 'level_up', 5) <> 1 then
    raise exception '§5 reaching level 5 again must not announce again';
  end if;

  update public.gamification_profiles set level = 2 where user_id = v_alice and tenant_id = v_ca;
  update public.gamification_profiles set level = 3 where user_id = v_alice and tenant_id = v_ca;
  if pg_temp.t871_posts(v_alice, 'level_up', null) <> 1 then
    raise exception '§5 levels below 5 must not announce';
  end if;

  update public.gamification_profiles set level = 5 where user_id = v_alice and tenant_id = v_ca;
  update public.gamification_profiles set level = 7 where user_id = v_alice and tenant_id = v_ca;
  if pg_temp.t871_school(v_alice, 'level_up', 7) <> 1 or pg_temp.t871_school(v_alice, 'level_up', 6) <> 0 then
    raise exception '§5 a 5 -> 7 jump must announce level 7 only';
  end if;
  raise notice 'PASS: §5 level milestones';
end $$;

-- ── 6. streaks: 7 / 30 / 100, once per threshold ─────────────────────────────
do $$
declare
  v_ca    constant uuid := '00000000-0000-0000-0000-000000000002';
  v_alice constant uuid := 'a1000000-0000-0000-0000-000000000004';
begin
  update public.gamification_profiles set current_streak = 6 where user_id = v_alice and tenant_id = v_ca;
  update public.gamification_profiles set current_streak = 7 where user_id = v_alice and tenant_id = v_ca;
  if pg_temp.t871_school(v_alice, 'streak', 7) <> 1 then
    raise exception '§6 6 -> 7 must announce a 7-day streak';
  end if;

  update public.gamification_profiles set current_streak = 8 where user_id = v_alice and tenant_id = v_ca;
  if pg_temp.t871_posts(v_alice, 'streak', null) <> 1 then
    raise exception '§6 day 8 must not announce';
  end if;

  update public.gamification_profiles set current_streak = 1 where user_id = v_alice and tenant_id = v_ca;
  update public.gamification_profiles set current_streak = 6 where user_id = v_alice and tenant_id = v_ca;
  update public.gamification_profiles set current_streak = 7 where user_id = v_alice and tenant_id = v_ca;
  if pg_temp.t871_school(v_alice, 'streak', 7) <> 1 then
    raise exception '§6 a rebuilt 7-day streak must not announce again';
  end if;

  update public.gamification_profiles set current_streak = 29 where user_id = v_alice and tenant_id = v_ca;
  update public.gamification_profiles set current_streak = 30 where user_id = v_alice and tenant_id = v_ca;
  if pg_temp.t871_school(v_alice, 'streak', 30) <> 1 then
    raise exception '§6 29 -> 30 must announce a 30-day streak';
  end if;
  raise notice 'PASS: §6 streak milestones';
end $$;

-- ── 7. gates: nothing is announced when any of them refuses ─────────────────
do $$
declare
  v_default constant uuid := '00000000-0000-0000-0000-000000000001';
  v_ca      constant uuid := '00000000-0000-0000-0000-000000000002';
  v_alice   constant uuid := 'a1000000-0000-0000-0000-000000000004';
  v_creator constant uuid := 'a1000000-0000-0000-0000-000000000003';
  v_student constant uuid := 'a1000000-0000-0000-0000-000000000001';  -- Default School
  v_course int;
begin
  -- School switch off: course and school milestones.
  insert into public.tenant_settings (tenant_id, setting_key, setting_value)
  values (v_ca, 'community_milestone_posts', '{"enabled": false}');
  v_course := pg_temp.t871_course(v_ca, '871 H switch off', 1, 0, false, v_alice);
  perform pg_temp.t871_complete(v_alice, v_course, 1);
  update public.gamification_profiles set level = 8 where user_id = v_alice and tenant_id = v_ca;
  update public.gamification_profiles set level = 9 where user_id = v_alice and tenant_id = v_ca;
  if pg_temp.t871_posts(v_alice, 'course_completion', v_course) <> 0 or pg_temp.t871_school(v_alice, 'level_up', 9) <> 0 then
    raise exception '§7 the school switch off must stop milestones';
  end if;
  delete from public.tenant_settings where tenant_id = v_ca and setting_key = 'community_milestone_posts';

  -- The student opted out.
  update public.profiles set share_milestones = false where id = v_alice;
  v_course := pg_temp.t871_course(v_ca, '871 I opted out', 1, 0, false, v_alice);
  perform pg_temp.t871_complete(v_alice, v_course, 1);
  update public.gamification_profiles set level = 10 where user_id = v_alice and tenant_id = v_ca;
  if pg_temp.t871_posts(v_alice, 'course_completion', v_course) <> 0 or pg_temp.t871_school(v_alice, 'level_up', 10) <> 0 then
    raise exception '§7 an opted-out student must not be announced';
  end if;
  update public.profiles set share_milestones = true where id = v_alice;

  -- Staff completing a course (previewing) never announce.
  v_course := pg_temp.t871_course(v_ca, '871 J staff', 1, 0, false, v_creator);
  perform pg_temp.t871_complete(v_creator, v_course, 1);
  if exists (select 1 from public.community_posts where author_id = v_creator and post_type = 'milestone') then
    raise exception '§7 an admin completing a course must not be announced';
  end if;

  -- Muted in the school.
  insert into public.community_user_mutes (tenant_id, user_id, muted_by, reason)
  values (v_ca, v_alice, v_creator, '871 test');
  v_course := pg_temp.t871_course(v_ca, '871 K muted', 1, 0, false, v_alice);
  perform pg_temp.t871_complete(v_alice, v_course, 1);
  if pg_temp.t871_posts(v_alice, 'course_completion', v_course) <> 0 then
    raise exception '§7 a muted student must not be announced';
  end if;
  delete from public.community_user_mutes where tenant_id = v_ca and user_id = v_alice;

  -- A school whose plan has no community.
  if public.community_enabled(v_default) then
    raise exception '§7 fixture: Default School must be on a plan without the community';
  end if;
  v_course := pg_temp.t871_course(v_default, '871 L no community', 1, 0, false, v_student);
  perform pg_temp.t871_complete(v_student, v_course, 1);
  update public.gamification_profiles set level = 4 where user_id = v_student and tenant_id = v_default;
  update public.gamification_profiles set level = 5 where user_id = v_student and tenant_id = v_default;
  if exists (select 1 from public.community_posts where author_id = v_student and post_type = 'milestone') then
    raise exception '§7 a school without the community must not get milestones';
  end if;

  -- No course access (course E, §4): nothing at all.
  if exists (select 1 from public.community_posts where author_id = v_alice and course_id = current_setting('t871.e')::int) then
    raise exception '§7 a course without access must not post';
  end if;
  raise notice 'PASS: §7 switch, opt-out, staff, mute, plan and access gates';
end $$;

-- ── 9. privileges and RLS ─────────────────────────────────────────────────────
do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array[
    'public.community_create_milestone(uuid,uuid,integer,text,jsonb)',
    'public.community_milestone_allowed(uuid,uuid)',
    'public.community_milestone_check_completion(uuid,uuid,integer)',
    'public.is_course_complete(uuid,integer)'
  ] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception '§9 % must not be able to execute %', v_role, v_fn;
      end if;
    end loop;
  end loop;

  -- award_xp() sets level and streak, which now publish posts: triggers and
  -- the service role only.
  foreach v_fn in array array[
    'public.award_xp(uuid,text,integer,text,text)',
    'public.award_xp(uuid,text,integer,text,text,uuid)'
  ] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception '§9 % must not be able to execute %', v_role, v_fn;
      end if;
    end loop;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception '§9 service_role (check-achievements) must keep %', v_fn;
    end if;
  end loop;
end $$;

-- Alice cannot level up someone else (or herself) by calling award_xp.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000002","tenant_role":"student"}', true); end $$;
do $$
begin
  begin
    perform public.award_xp('a1000000-0000-0000-0000-000000000003', 'forged', 1000000, null, null, '00000000-0000-0000-0000-000000000002');
    raise exception '§9 an authenticated user called award_xp';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

-- The creator (Code Academy admin) through RLS.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000002","tenant_role":"admin"}', true); end $$;
do $$
declare
  v_id uuid;
  v_rows int;
begin
  -- Positive control: staff may post.
  insert into public.community_posts (tenant_id, author_id, content)
  values ('00000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', '871 staff control')
  returning id into v_id;
  if v_id is null then raise exception '§9 control: the admin could not post'; end if;

  begin
    insert into public.community_posts (tenant_id, author_id, content, post_type, milestone_type, milestone_data)
    values ('00000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', '', 'milestone', 'level_up', '{"level": 99}');
    raise exception '§9 an admin inserted a milestone post through RLS';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.community_posts (tenant_id, author_id, content, milestone_type)
    values ('00000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 'x', 'streak');
    raise exception '§9 an admin inserted milestone columns on a standard post through RLS';
  exception when insufficient_privilege then null;
  end;

  -- Staff may edit posts through RLS, but not a milestone.
  update public.community_posts set content = 'rewritten'
   where author_id = 'a1000000-0000-0000-0000-000000000004' and post_type = 'milestone' and course_id is null;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception '§9 an admin rewrote % milestone posts', v_rows; end if;
end $$;
reset role;

-- Alice through RLS.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000002","tenant_role":"student"}', true); end $$;
do $$
declare
  v_own uuid;
  v_milestone uuid;
  v_rows int;
begin
  insert into public.community_posts (tenant_id, author_id, content)
  values ('00000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', '871 alice control')
  returning id into v_own;
  update public.community_posts set content = '871 alice control, edited' where id = v_own;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception '§9 control: Alice could not edit her own post (% rows)', v_rows; end if;

  select id into v_milestone from public.community_posts
   where author_id = 'a1000000-0000-0000-0000-000000000004' and post_type = 'milestone' and course_id is null
   limit 1;
  if v_milestone is null then raise exception '§9 fixture: Alice should see her school milestone'; end if;
  update public.community_posts set content = 'hacked' where id = v_milestone;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception '§9 Alice rewrote her milestone post'; end if;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

do $$ begin raise notice 'PASS: §9 the writer is owner-only; milestones are neither inserted nor edited through RLS'; end $$;

-- ── 10. parity with calculate_course_completion ─────────────────────────────
do $$
declare
  v_ca    constant uuid := '00000000-0000-0000-0000-000000000002';
  v_alice constant uuid := 'a1000000-0000-0000-0000-000000000004';
  v_p int := pg_temp.t871_course(v_ca, '871 P parity', 2, 1, false, null);
  v_exams_only int := pg_temp.t871_course(v_ca, '871 P exams only', 0, 1, false, null);
  v_empty int := pg_temp.t871_course(v_ca, '871 P empty', 0, 0, false, null);
  v_lessons int := pg_temp.t871_course(v_ca, '871 P lessons only', 1, 0, false, null);
  v_half int := pg_temp.t871_course(v_ca, '871 P half template', 2, 0, false, null);
  v_sub int;
begin
  if pg_temp.t871_parity(v_alice, v_p) then raise exception '§10 nothing done is not complete'; end if;
  perform pg_temp.t871_complete(v_alice, v_p, 1);
  if pg_temp.t871_parity(v_alice, v_p) then raise exception '§10 half the lessons is not complete'; end if;
  perform pg_temp.t871_complete(v_alice, v_p, 2);
  if pg_temp.t871_parity(v_alice, v_p) then raise exception '§10 no exam taken is not complete'; end if;
  v_sub := pg_temp.t871_score(v_alice, v_p, 60);
  if pg_temp.t871_parity(v_alice, v_p) then raise exception '§10 a 60 is not complete'; end if;
  update public.exam_scores set score = 80 where submission_id = v_sub;
  if not pg_temp.t871_parity(v_alice, v_p) then raise exception '§10 lessons + an 80 is complete'; end if;
  -- A regrade below the bar un-completes it again (for the rule; the post stays).
  update public.exam_scores set score = 50 where submission_id = v_sub;
  if pg_temp.t871_parity(v_alice, v_p) then raise exception '§10 a regrade to 50 is not complete'; end if;

  perform pg_temp.t871_score(v_alice, v_exams_only, 90);
  if pg_temp.t871_parity(v_alice, v_exams_only) then raise exception '§10 exams-only is never 100%% lessons'; end if;
  if pg_temp.t871_parity(v_alice, v_empty) then raise exception '§10 an empty course is never complete'; end if;
  perform pg_temp.t871_complete(v_alice, v_lessons, 1);
  if not pg_temp.t871_parity(v_alice, v_lessons) then raise exception '§10 a done lessons-only course is complete'; end if;

  -- A real template with lower thresholds decides the certificate, not
  -- "completed": half the lessons earn it, the course is not done.
  insert into public.certificate_templates (course_id, tenant_id, template_name, is_active, min_lesson_completion_pct)
  values (v_half, v_ca, '871 half', true, 50);
  perform pg_temp.t871_complete(v_alice, v_half, 1);
  if not coalesce((public.calculate_course_completion(v_alice, v_half) ->> 'eligible')::boolean, false) then
    raise exception '§10 fixture: a 50%% template makes half the lessons certificate-eligible';
  end if;
  if public.is_course_complete(v_alice, v_half) then
    raise exception '§10 a 50%% template must not make half the lessons a completed course';
  end if;
  perform pg_temp.t871_complete(v_alice, v_half, 2);
  if not public.is_course_complete(v_alice, v_half) then
    raise exception '§10 every lesson of a 50%% template course is complete';
  end if;
  raise notice 'PASS: §10 is_course_complete matches calculate_course_completion, whatever the template';
end $$;

-- ── 11. a deleted course takes its milestones, nothing else ──────────────────
do $$
declare
  v_ca      constant uuid := '00000000-0000-0000-0000-000000000002';
  v_alice   constant uuid := 'a1000000-0000-0000-0000-000000000004';
  v_q int := pg_temp.t871_course(v_ca, '871 Q deleted', 1, 0, false, v_alice);
  v_human uuid;
  v_school_before int;
begin
  perform pg_temp.t871_complete(v_alice, v_q, 1);
  if pg_temp.t871_posts(v_alice, 'course_completion', v_q) <> 1 then
    raise exception '§11 fixture: Q completion should announce';
  end if;
  insert into public.community_posts (tenant_id, author_id, course_id, content)
  values (v_ca, 'a1000000-0000-0000-0000-000000000003', v_q, '871 human course post')
  returning id into v_human;
  select count(*) into v_school_before from public.community_posts
   where author_id = v_alice and post_type = 'milestone' and course_id is null;

  delete from public.lesson_completions where lesson_id = pg_temp.t871_lesson(v_q, 1);
  delete from public.courses where course_id = v_q;

  if exists (select 1 from public.community_posts where post_type = 'milestone' and milestone_data ->> 'course_id' = v_q::text) then
    raise exception '§11 the deleted course''s milestones must go with it';
  end if;
  if not exists (select 1 from public.community_posts where id = v_human and course_id is null) then
    raise exception '§11 a human course post keeps the SET NULL behaviour';
  end if;
  if (select count(*) from public.community_posts where author_id = v_alice and post_type = 'milestone' and course_id is null)
     <> v_school_before then
    raise exception '§11 school milestones must stay';
  end if;
  raise notice 'PASS: §11 course deletion removes only its milestones';
end $$;

-- ── 12. the fold depends on trigger-name order ──────────────────────────────
do $$
declare
  v_bad int;
begin
  -- Postgres fires same-event triggers in name order: every certificate
  -- issuer must sort after the completion trigger on the same table.
  select count(*) into v_bad
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal
    and (
      (t.tgrelid = 'public.lesson_completions'::regclass and p.proname = 'on_lesson_completed_trigger'
        and t.tgname collate "C" <= 'on_lesson_completed_community_milestone' collate "C")
      or
      (t.tgrelid = 'public.exam_scores'::regclass and p.proname = 'on_exam_score_row_certificate_trigger'
        and t.tgname collate "C" <= 'on_exam_score_community_milestone' collate "C")
    );
  if v_bad <> 0 then
    raise exception '§12 a certificate trigger sorts before the completion trigger (% found)', v_bad;
  end if;
  if (select count(*) from pg_trigger where tgname in (
        'on_lesson_completed_community_milestone', 'on_exam_score_community_milestone',
        'on_certificate_issued_community_milestone', 'on_gamification_progress_community_milestone',
        'on_course_deleted_community_milestones')) <> 5 then
    raise exception '§12 a milestone trigger is missing';
  end if;
  raise notice 'PASS: §12 trigger order guards the fold';
end $$;

-- ── 13. only the event that completes the course announces it ──────────────
do $$
declare
  v_ca    constant uuid := '00000000-0000-0000-0000-000000000002';
  v_alice constant uuid := 'a1000000-0000-0000-0000-000000000004';
  v_s int := pg_temp.t871_course(v_ca, '871 S regraded', 1, 1, false, v_alice);
  v_sub int;
begin
  -- Completed while sharing was off (or before this shipped): nothing posted.
  update public.profiles set share_milestones = false where id = v_alice;
  perform pg_temp.t871_complete(v_alice, v_s, 1);
  v_sub := pg_temp.t871_score(v_alice, v_s, 80);
  update public.profiles set share_milestones = true where id = v_alice;
  if pg_temp.t871_posts(v_alice, 'course_completion', v_s) <> 0 then
    raise exception '§13 fixture: an opted-out completion must not post';
  end if;

  -- A teacher regrades the passing 80: old news, not a completion.
  update public.exam_scores set score = 90 where submission_id = v_sub;
  if pg_temp.t871_posts(v_alice, 'course_completion', v_s) <> 0 then
    raise exception '§13 regrading a passing score must not announce a completion';
  end if;

  -- Down below the bar and back up: that regrade IS the one that completes it.
  update public.exam_scores set score = 50 where submission_id = v_sub;
  update public.exam_scores set score = 75 where submission_id = v_sub;
  if pg_temp.t871_posts(v_alice, 'course_completion', v_s) <> 1 then
    raise exception '§13 a regrade from failing to passing must announce, got %',
      pg_temp.t871_posts(v_alice, 'course_completion', v_s);
  end if;
  raise notice 'PASS: §13 a regrade of a passing score never announces';
end $$;

-- ── 14. a template below 100%: the certificate alone, the completion later ─
do $$
declare
  v_ca    constant uuid := '00000000-0000-0000-0000-000000000002';
  v_alice constant uuid := 'a1000000-0000-0000-0000-000000000004';
  v_t int := pg_temp.t871_course(v_ca, '871 T half template', 2, 0, false, v_alice);
begin
  insert into public.certificate_templates (course_id, tenant_id, template_name, is_active, min_lesson_completion_pct)
  values (v_t, v_ca, '871 T half', true, 50);

  perform pg_temp.t871_complete(v_alice, v_t, 1);
  if not exists (select 1 from public.certificates where user_id = v_alice and course_id = v_t and revoked_at is null) then
    raise exception '§14 fixture: half the lessons should auto-issue the certificate';
  end if;
  if pg_temp.t871_posts(v_alice, 'certificate', v_t) <> 1 or pg_temp.t871_posts(v_alice, 'course_completion', v_t) <> 0 then
    raise exception '§14 half the lessons: expected 1 certificate and 0 completion posts, got % / %',
      pg_temp.t871_posts(v_alice, 'certificate', v_t), pg_temp.t871_posts(v_alice, 'course_completion', v_t);
  end if;

  perform pg_temp.t871_complete(v_alice, v_t, 2);
  if pg_temp.t871_posts(v_alice, 'course_completion', v_t) <> 1 or pg_temp.t871_posts(v_alice, 'certificate', v_t) <> 1 then
    raise exception '§14 every lesson: expected 1 completion and still 1 certificate post, got % / %',
      pg_temp.t871_posts(v_alice, 'course_completion', v_t), pg_temp.t871_posts(v_alice, 'certificate', v_t);
  end if;
  if exists (
    select 1 from public.community_posts
    where author_id = v_alice and milestone_type = 'course_completion' and course_id = v_t
      and milestone_data ? 'certificate'
  ) then
    raise exception '§14 a completion after an earlier certificate must not claim it';
  end if;
  raise notice 'PASS: §14 "Completed" waits for every lesson; the certificate posts on its own';
end $$;

-- ── 8. a failing milestone never breaks the event (last: it breaks the writer) ─
create or replace function public.community_create_milestone(
  _user_id uuid, _tenant_id uuid, _course_id integer, _type text, _data jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  raise exception '871 simulated milestone failure';
end $$;

do $$
declare
  v_ca    constant uuid := '00000000-0000-0000-0000-000000000002';
  v_alice constant uuid := 'a1000000-0000-0000-0000-000000000004';
  v_r int := pg_temp.t871_course(v_ca, '871 R failure isolation', 1, 0, true, v_alice);
  v_level int;
begin
  -- The next 100 XP crosses 850: level 5.
  update public.gamification_profiles set level = 4, total_xp = 800 where user_id = v_alice and tenant_id = v_ca;
  delete from public.community_posts where author_id = v_alice and milestone_type = 'level_up';

  perform pg_temp.t871_complete(v_alice, v_r, 1);

  if not exists (select 1 from public.lesson_completions where user_id = v_alice and lesson_id = pg_temp.t871_lesson(v_r, 1)) then
    raise exception '§8 the lesson completion must land';
  end if;
  if not exists (select 1 from public.certificates where user_id = v_alice and course_id = v_r and revoked_at is null) then
    raise exception '§8 the certificate must still issue';
  end if;
  select level into v_level from public.gamification_profiles where user_id = v_alice and tenant_id = v_ca;
  if v_level <> 5 then raise exception '§8 the XP level-up must land, level is %', v_level; end if;
  if exists (select 1 from public.community_posts where author_id = v_alice and (course_id = v_r or milestone_type = 'level_up')) then
    raise exception '§8 no milestone should exist when the writer fails';
  end if;
  raise notice 'PASS: §8 a failing writer never breaks completion, certificate or XP';
end $$;

do $$ begin raise notice 'PASS: #871 — milestone posts are written by the database, once, behind every gate'; end $$;

rollback;
