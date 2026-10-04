-- Issue #873 — grading graded discussion prompts: who may grade whom, who
-- reads which grade, the XP and the notification a grade fires. Rolled back.
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off \
--     -v ON_ERROR_STOP=1 < tests/sql/issue-873-community-prompt-grades.sql
--
-- Cast (seed): A = Alice (Code Academy student, access to 2001);
-- B = student@e2etest.com, added to Code Academy as a student here;
-- T = creator@codeacademy.com (Code Academy admin, author of 2001);
-- O = owner@e2etest.com (admin of Default School only — another school).
begin;

create function pg_temp.act_as(_user uuid, _role text, _tenant uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', _user, 'role', 'authenticated',
    'tenant_id', _tenant, 'tenant_role', _role)::text, true);
  set local role authenticated;
end $$;

create function pg_temp.act_as_system() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.expect_error(_sql text, _state text, _label text) returns void language plpgsql as $$
begin
  begin
    execute _sql;
  exception when others then
    if sqlstate <> _state then
      raise exception 'FAIL %: expected SQLSTATE %, got % (%)', _label, _state, sqlstate, sqlerrm;
    end if;
    raise notice 'ok  %', _label;
    return;
  end;
  raise exception 'FAIL %: expected SQLSTATE %, got success', _label, _state;
end $$;

-- ---------------------------------------------------------------------------
-- Setup (system)
-- ---------------------------------------------------------------------------
insert into public.tenant_users (tenant_id, user_id, role, status)
values ('00000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'student', 'active')
on conflict (tenant_id, user_id) do update set role = 'student', status = 'active';

insert into public.community_posts (id, tenant_id, author_id, course_id, post_type, title, content, is_graded, due_at)
values
  ('87300000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000003', 2001, 'discussion_prompt', 'Explain closures',
   'In your own words.', true, now() + interval '3 days'),
  ('87300000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000003', 2001, 'discussion_prompt', 'Not graded',
   'Chat.', false, null);

insert into public.community_comments (id, tenant_id, post_id, author_id, content)
values
  ('87300000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002',
   '87300000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'A closure keeps its scope.'),
  ('87300000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000002',
   '87300000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'B answers too.');

-- due_at only on a graded prompt.
select pg_temp.expect_error($q$
  update public.community_posts set due_at = now() where id = '87300000-0000-0000-0000-000000000002'
$q$, '23514', 'due_at refused on an ungraded prompt');

-- ---------------------------------------------------------------------------
-- 1. The teacher grades A (RLS path)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a1000000-0000-0000-0000-000000000003', 'admin', '00000000-0000-0000-0000-000000000002');

insert into public.community_prompt_grades (tenant_id, post_id, student_id, score, feedback, graded_by)
values ('00000000-0000-0000-0000-000000000002', '87300000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000004', 85, 'Clear.', null);

do $$
declare g record;
begin
  select * into g from public.community_prompt_grades
   where post_id = '87300000-0000-0000-0000-000000000001' and student_id = 'a1000000-0000-0000-0000-000000000004';
  assert g.graded_by = 'a1000000-0000-0000-0000-000000000003', 'graded_by stamped from auth.uid()';
  assert g.comment_id = '87300000-0000-0000-0000-0000000000a1', 'comment_id filled with the latest answer';
  assert g.score = 85 and g.feedback = 'Clear.', 'score and feedback stored';
  raise notice 'ok  teacher grades a student; grader and answer stamped';
end $$;

-- Not a graded prompt / not a student / someone else's answer.
select pg_temp.expect_error($q$
  insert into public.community_prompt_grades (tenant_id, post_id, student_id, score)
  values ('00000000-0000-0000-0000-000000000002', '87300000-0000-0000-0000-000000000002',
          'a1000000-0000-0000-0000-000000000004', 50)
$q$, '23514', 'ungraded prompt refused');

select pg_temp.expect_error($q$
  insert into public.community_prompt_grades (tenant_id, post_id, student_id, score)
  values ('00000000-0000-0000-0000-000000000002', '87300000-0000-0000-0000-000000000001',
          'a1000000-0000-0000-0000-000000000003', 50)
$q$, '23514', 'grading a non-student refused');

select pg_temp.expect_error($q$
  insert into public.community_prompt_grades (tenant_id, post_id, student_id, comment_id, score)
  values ('00000000-0000-0000-0000-000000000002', '87300000-0000-0000-0000-000000000001',
          'a1000000-0000-0000-0000-000000000001', '87300000-0000-0000-0000-0000000000a1', 50)
$q$, '23514', 'another student''s answer refused');

select pg_temp.expect_error($q$
  insert into public.community_prompt_grades (tenant_id, post_id, student_id, score)
  values ('00000000-0000-0000-0000-000000000002', '87300000-0000-0000-0000-000000000001',
          'a1000000-0000-0000-0000-000000000001', 101)
$q$, '23514', 'score above 100 refused');

-- Moving a grade to another student is not even a grantable column.
select pg_temp.expect_error($q$
  update public.community_prompt_grades set student_id = 'a1000000-0000-0000-0000-000000000001'
   where post_id = '87300000-0000-0000-0000-000000000001'
$q$, '42501', 'student_id is not updatable by clients');

select pg_temp.act_as_system();

-- ---------------------------------------------------------------------------
-- 2. XP and notification
-- ---------------------------------------------------------------------------
do $$
declare n record; un record; xp_rows int;
begin
  select count(*) into xp_rows from public.gamification_xp_transactions
   where user_id = 'a1000000-0000-0000-0000-000000000004'
     and tenant_id = '00000000-0000-0000-0000-000000000002'
     and action_type = 'community_prompt_graded'
     and reference_id = '87300000-0000-0000-0000-000000000001';
  assert xp_rows = 1, format('one XP award, got %s', xp_rows);

  select * into n from public.notifications
   where community_post_id = '87300000-0000-0000-0000-000000000001'
     and metadata ->> 'kind' = 'community_prompt_graded';
  assert n.id is not null, 'notification written';
  assert n.target_user_ids = array['a1000000-0000-0000-0000-000000000004'::uuid], 'for the student only';
  assert (n.metadata ->> 'score')::int = 85, 'carries the score';
  assert not (n.metadata ? 'feedback') and n.content = '85/100', 'never the feedback text';
  assert n.created_by is null, 'system-written';

  select * into un from public.user_notifications where notification_id = n.id;
  assert un.user_id = 'a1000000-0000-0000-0000-000000000004' and not un.in_app_read, 'unread for the student';
  raise notice 'ok  grade awards 20 XP once and notifies the student';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Who reads what
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a1000000-0000-0000-0000-000000000004', 'student', '00000000-0000-0000-0000-000000000002');
do $$
begin
  assert (select count(*) from public.community_prompt_grades) = 1, 'A reads her own grade';
  raise notice 'ok  student reads own grade';
end $$;
select pg_temp.expect_error($q$
  insert into public.community_prompt_grades (tenant_id, post_id, student_id, score, graded_by)
  values ('00000000-0000-0000-0000-000000000002', '87300000-0000-0000-0000-000000000001',
          'a1000000-0000-0000-0000-000000000001', 100, 'a1000000-0000-0000-0000-000000000004')
$q$, '42501', 'a student cannot grade');
update public.community_prompt_grades set score = 100 where student_id = 'a1000000-0000-0000-0000-000000000004';
select pg_temp.act_as_system();
do $$
begin
  assert (select score from public.community_prompt_grades
           where student_id = 'a1000000-0000-0000-0000-000000000004') = 85, 'a student cannot change her grade';
  raise notice 'ok  student cannot write grades';
end $$;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001', 'student', '00000000-0000-0000-0000-000000000002');
do $$
begin
  assert (select count(*) from public.community_prompt_grades) = 0, 'B cannot read A''s grade';
  raise notice 'ok  another student reads nothing';
end $$;
select pg_temp.act_as_system();

-- Another school's admin: reads nothing, writes nothing.
select pg_temp.act_as('a1000000-0000-0000-0000-000000000002', 'admin', '00000000-0000-0000-0000-000000000001');
do $$
begin
  assert (select count(*) from public.community_prompt_grades) = 0, 'cross-tenant admin reads nothing';
  raise notice 'ok  cross-tenant read blocked';
end $$;
select pg_temp.expect_error($q$
  insert into public.community_prompt_grades (tenant_id, post_id, student_id, score)
  values ('00000000-0000-0000-0000-000000000002', '87300000-0000-0000-0000-000000000001',
          'a1000000-0000-0000-0000-000000000001', 10)
$q$, '42501', 'cross-tenant grading blocked');
select pg_temp.act_as_system();

-- The service role must name a teacher of the school.
select pg_temp.expect_error($q$
  insert into public.community_prompt_grades (tenant_id, post_id, student_id, score)
  values ('00000000-0000-0000-0000-000000000002', '87300000-0000-0000-0000-000000000001',
          'a1000000-0000-0000-0000-000000000001', 10)
$q$, '42501', 'service role without graded_by refused');
select pg_temp.expect_error($q$
  insert into public.community_prompt_grades (tenant_id, post_id, student_id, score, graded_by)
  values ('00000000-0000-0000-0000-000000000002', '87300000-0000-0000-0000-000000000001',
          'a1000000-0000-0000-0000-000000000001', 10, 'a1000000-0000-0000-0000-000000000002')
$q$, '42501', 'service role naming another school''s admin refused');

-- ---------------------------------------------------------------------------
-- 4. Re-grades
-- ---------------------------------------------------------------------------
update public.user_notifications un set in_app_read = true, in_app_read_at = now()
  from public.notifications n
 where n.id = un.notification_id and n.metadata ->> 'kind' = 'community_prompt_graded';

select pg_temp.act_as('a1000000-0000-0000-0000-000000000003', 'admin', '00000000-0000-0000-0000-000000000002');
-- Same values: silent.
update public.community_prompt_grades set score = 85, feedback = 'Clear.'
 where student_id = 'a1000000-0000-0000-0000-000000000004';
select pg_temp.act_as_system();
do $$
begin
  assert (select bool_and(un.in_app_read) from public.user_notifications un
            join public.notifications n on n.id = un.notification_id
           where n.metadata ->> 'kind' = 'community_prompt_graded'), 'identical save leaves it read';
  raise notice 'ok  saving the same grade notifies nobody';
end $$;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000003', 'admin', '00000000-0000-0000-0000-000000000002');
update public.community_prompt_grades set score = 90
 where student_id = 'a1000000-0000-0000-0000-000000000004';
select pg_temp.act_as_system();
do $$
begin
  assert (select count(*) from public.notifications
           where metadata ->> 'kind' = 'community_prompt_graded') = 1, 'still one notification';
  assert (select (metadata ->> 'score')::int from public.notifications
           where metadata ->> 'kind' = 'community_prompt_graded') = 90, 'new score';
  assert (select bool_and(not un.in_app_read) from public.user_notifications un
            join public.notifications n on n.id = un.notification_id
           where n.metadata ->> 'kind' = 'community_prompt_graded'), 'unread again';
  assert (select count(*) from public.gamification_xp_transactions
           where user_id = 'a1000000-0000-0000-0000-000000000004'
             and action_type = 'community_prompt_graded'
             and reference_id = '87300000-0000-0000-0000-000000000001') = 1, 're-grade earns no more XP';
  raise notice 'ok  re-grade updates the notification in place, no more XP';
end $$;

-- A "no answer" grade earns nothing. B answered, so remove B's answer first.
delete from public.community_comments where id = '87300000-0000-0000-0000-0000000000b1';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000003', 'admin', '00000000-0000-0000-0000-000000000002');
insert into public.community_prompt_grades (tenant_id, post_id, student_id, score)
values ('00000000-0000-0000-0000-000000000002', '87300000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000001', 0);
select pg_temp.act_as_system();
do $$
begin
  assert (select comment_id from public.community_prompt_grades
           where student_id = 'a1000000-0000-0000-0000-000000000001') is null, 'no answer, no comment_id';
  assert (select count(*) from public.gamification_xp_transactions
           where user_id = 'a1000000-0000-0000-0000-000000000001'
             and action_type = 'community_prompt_graded'
             and reference_id = '87300000-0000-0000-0000-000000000001') = 0, 'no XP for a no-answer grade';
  raise notice 'ok  grading without an answer earns nothing';
end $$;

-- ---------------------------------------------------------------------------
-- 5. System clears and un-grading
-- ---------------------------------------------------------------------------
-- Deleting the graded answer clears comment_id and does not fail.
delete from public.community_comments where id = '87300000-0000-0000-0000-0000000000a1';
do $$
begin
  assert (select comment_id from public.community_prompt_grades
           where student_id = 'a1000000-0000-0000-0000-000000000004') is null, 'answer delete clears comment_id';
  assert (select score from public.community_prompt_grades
           where student_id = 'a1000000-0000-0000-0000-000000000004') = 90, 'grade kept';
  raise notice 'ok  deleting the graded answer keeps the grade';
end $$;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000003', 'admin', '00000000-0000-0000-0000-000000000002');
delete from public.community_prompt_grades where student_id = 'a1000000-0000-0000-0000-000000000004';
select pg_temp.act_as_system();
do $$
begin
  assert (select count(*) from public.notifications
           where metadata ->> 'kind' = 'community_prompt_graded'
             and target_user_ids = array['a1000000-0000-0000-0000-000000000004'::uuid]) = 0,
         'un-grading withdraws the notification';
  raise notice 'ok  un-grading withdraws the notification';
end $$;

rollback;
