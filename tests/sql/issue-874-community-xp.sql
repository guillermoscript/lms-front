-- Issue #874 — XP for community participation: what earns, how much, how
-- often, and that XP never blocks posting. Rolled back.
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off \
--     -v ON_ERROR_STOP=1 < tests/sql/issue-874-community-xp.sql
--
-- Cast (seed): A = Alice (Code Academy student, access to 2001);
-- B = student@e2etest.com added to Code Academy with access to 2001;
-- T = creator@codeacademy.com (Code Academy admin).
begin;

create function pg_temp.act_as(_user uuid, _role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', _user, 'role', 'authenticated',
    'tenant_id', '00000000-0000-0000-0000-000000000002', 'tenant_role', _role)::text, true);
  set local role authenticated;
end $$;

create function pg_temp.act_as_system() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- XP rows of one action for a user in Code Academy.
create function pg_temp.xp(_user uuid, _action text) returns table (n bigint, total bigint) language sql as $$
  select count(*), coalesce(sum(xp_amount), 0)
    from public.gamification_xp_transactions
   where user_id = _user and action_type = _action
     and tenant_id = '00000000-0000-0000-0000-000000000002'
$$;

do $$
declare
  ca  constant uuid := '00000000-0000-0000-0000-000000000002';
  a   constant uuid := 'a1000000-0000-0000-0000-000000000004';
  b   constant uuid := 'a1000000-0000-0000-0000-000000000001';
  t   constant uuid := 'a1000000-0000-0000-0000-000000000003';
  pr  constant uuid := '87400000-0000-0000-0000-000000000001'; -- T's discussion prompt
  sp  constant uuid := '87400000-0000-0000-0000-000000000002'; -- A's standard post
  q   constant uuid := '87400000-0000-0000-0000-000000000003'; -- A's question
  c_p constant uuid := '87400000-0000-0000-0000-000000000101'; -- B's answer to the prompt
  c_q constant uuid := '87400000-0000-0000-0000-000000000102'; -- B's answer to the question
  c_a constant uuid := '87400000-0000-0000-0000-000000000103'; -- A's own answer to q
  total_before int;
  r record;
  i int;
  cid uuid;
begin
  -- ---------------------------------------------------------------- setup
  delete from community_user_mutes where tenant_id = ca;
  delete from community_user_blocks where blocker_id in (a, b, t) or blocked_id in (a, b, t);
  insert into tenant_users (tenant_id, user_id, role, status) values (ca, b, 'student', 'active')
  on conflict (tenant_id, user_id) do update set role = 'student', status = 'active';
  insert into entitlements (user_id, course_id, tenant_id, source_type) values (b, 2001, ca, 'admin_grant')
  on conflict do nothing;
  delete from gamification_xp_transactions
   where tenant_id = ca and user_id in (a, b, t) and action_type like 'community_%';

  -- §1 the rules are registered, #873's type included, and nothing else is
  select * into r from community_xp_rule('community_prompt_graded');
  if r.xp <> 20 or not r.once then raise exception '§1 community_prompt_graded rule %', r; end if;
  select * into r from community_xp_rule('like');
  if r.xp is not null then raise exception '§1 unknown action has a rule'; end if;
  begin
    perform community_award_xp(a, ca, 'community_bogus', 'x', 'x');
    raise exception '§1 unknown action awarded';
  exception when others then
    if sqlerrm not like 'community_xp_unknown_action%' then raise; end if;
  end;
  raise notice 'PASS §1 rules';

  -- §2 a course post earns 5 through RLS, with the right tenant and reference
  perform pg_temp.act_as(a, 'student');
  insert into community_posts (id, tenant_id, author_id, course_id, post_type, content)
  values (sp, ca, a, 2001, 'standard', 'Hello course');
  perform pg_temp.act_as_system();
  select * into r from gamification_xp_transactions
   where user_id = a and action_type = 'community_post';
  if r.xp_amount <> 5 or r.tenant_id <> ca or r.reference_id <> sp::text or r.reference_type <> 'community_post' then
    raise exception '§2 post XP row %', r;
  end if;
  raise notice 'PASS §2 course post earns 5 with tenant + reference';

  -- §3 3 posts a day: the 4th earns nothing; school-feed, poll, milestone, hidden never earn
  insert into community_posts (id, tenant_id, author_id, course_id, post_type, content)
  values (q, ca, a, 2001, 'question', 'Why?');
  insert into community_posts (tenant_id, author_id, course_id, post_type, content)
  values (ca, a, 2001, 'standard', 'third'), (ca, a, 2001, 'standard', 'fourth');
  select * into r from pg_temp.xp(a, 'community_post');
  if r.n <> 3 or r.total <> 15 then raise exception '§3 post cap: % rows / % xp', r.n, r.total; end if;

  delete from gamification_xp_transactions where tenant_id = ca and user_id = b and action_type = 'community_post';
  insert into community_posts (tenant_id, author_id, course_id, post_type, content, milestone_type)
  values (ca, b, 2001, 'milestone', 'finished a course', 'course_completed');
  insert into community_posts (tenant_id, author_id, course_id, post_type, content)
  values (ca, b, 2001, 'poll', 'Which?');
  insert into community_posts (tenant_id, author_id, course_id, post_type, content)
  values (ca, b, null, 'standard', 'school feed');
  insert into community_posts (tenant_id, author_id, course_id, post_type, content, is_hidden)
  values (ca, b, 2001, 'standard', 'hidden', true);
  select * into r from pg_temp.xp(b, 'community_post');
  if r.n <> 0 then raise exception '§3 milestone/poll/school/hidden post earned (% rows)', r.n; end if;
  raise notice 'PASS §3 post cap + milestone/poll/school-feed/hidden never earn';

  -- §4 prompt answer: 15 once per prompt, instead of the comment XP; delete + repost can't re-earn
  insert into community_posts (id, tenant_id, author_id, course_id, post_type, title, content)
  values (pr, ca, t, 2001, 'discussion_prompt', 'Prompt', 'What did you learn?');
  perform pg_temp.act_as(b, 'student');
  insert into community_comments (id, tenant_id, post_id, author_id, content)
  values (c_p, ca, pr, b, 'I learned loops');
  perform pg_temp.act_as_system();
  select * into r from gamification_xp_transactions where user_id = b and action_type = 'community_prompt_answer';
  if r.xp_amount <> 15 or r.tenant_id <> ca or r.reference_id <> pr::text then
    raise exception '§4 prompt answer row %', r;
  end if;
  if (select n from pg_temp.xp(b, 'community_comment')) <> 0 then
    raise exception '§4 prompt answer also earned comment XP';
  end if;
  delete from community_comments where id = c_p;
  insert into community_comments (tenant_id, post_id, author_id, content)
  values (ca, pr, b, 'reposted answer');
  select * into r from pg_temp.xp(b, 'community_prompt_answer');
  if r.n <> 1 then raise exception '§4 prompt answer earned % times', r.n; end if;
  if (select n from pg_temp.xp(b, 'community_comment')) <> 1 then
    raise exception '§4 second comment on the prompt should earn the plain comment XP';
  end if;
  raise notice 'PASS §4 prompt answer once per prompt';

  -- §5 comments: 3 XP, 10 a day (replies count)
  for i in 1..11 loop
    insert into community_comments (tenant_id, post_id, author_id, content)
    values (ca, sp, b, 'comment ' || i);
  end loop;
  select * into r from pg_temp.xp(b, 'community_comment');
  if r.n <> 10 or r.total <> 30 then raise exception '§5 comment cap: % rows / % xp', r.n, r.total; end if;
  raise notice 'PASS §5 comment cap';

  -- §6 helpful: 2 XP to the author, never self, once per (target, reactor), 20 a day; like earns nothing
  perform pg_temp.act_as(b, 'student');
  insert into community_reactions (tenant_id, user_id, post_id, reaction_type) values (ca, b, sp, 'helpful');
  perform pg_temp.act_as_system();
  select * into r from gamification_xp_transactions where user_id = a and action_type = 'community_helpful_received';
  if r.xp_amount <> 2 or r.tenant_id <> ca or r.reference_id <> sp::text || ':' || b::text then
    raise exception '§6 helpful row %', r;
  end if;
  -- toggle off and on: no second award
  delete from community_reactions where user_id = b and post_id = sp and reaction_type = 'helpful';
  insert into community_reactions (tenant_id, user_id, post_id, reaction_type) values (ca, b, sp, 'helpful');
  -- self-helpful and like/fire earn nothing
  insert into community_reactions (tenant_id, user_id, post_id, reaction_type) values (ca, a, sp, 'helpful');
  insert into community_reactions (tenant_id, user_id, post_id, reaction_type) values (ca, t, sp, 'like');
  insert into community_reactions (tenant_id, user_id, post_id, reaction_type) values (ca, t, sp, 'fire');
  select * into r from pg_temp.xp(a, 'community_helpful_received');
  if r.n <> 1 then raise exception '§6 toggle/self/like earned (% rows)', r.n; end if;
  -- the daily cap: A marks 21 of B's comments helpful, B earns 20
  i := 0;
  for cid in select id from community_comments where post_id = sp and author_id = b loop
    insert into community_reactions (tenant_id, user_id, comment_id, reaction_type) values (ca, a, cid, 'helpful');
    i := i + 1;
  end loop;
  for i in 1..10 loop
    insert into community_comments (id, tenant_id, post_id, author_id, content)
    values (gen_random_uuid(), ca, sp, b, 'more ' || i) returning id into cid;
    insert into community_reactions (tenant_id, user_id, comment_id, reaction_type) values (ca, a, cid, 'helpful');
  end loop;
  select * into r from pg_temp.xp(b, 'community_helpful_received');
  if r.n <> 20 or r.total <> 40 then raise exception '§6 helpful cap: % rows / % xp', r.n, r.total; end if;
  raise notice 'PASS §6 helpful: author only, never self, no toggle farming, cap 20';

  -- §7 accepted answer: 25 to the answer's author once per question; self-answer never
  insert into community_comments (id, tenant_id, post_id, author_id, content) values
    (c_q, ca, q, b, 'Because'),
    (c_a, ca, q, a, 'Found it myself');
  update community_posts set accepted_comment_id = c_a, accepted_by = a where id = q;
  if (select n from pg_temp.xp(a, 'community_answer_accepted')) <> 0 then
    raise exception '§7 accepting your own answer earned XP';
  end if;
  update community_posts set accepted_comment_id = c_q, accepted_by = a where id = q;
  select * into r from gamification_xp_transactions where user_id = b and action_type = 'community_answer_accepted';
  if r.xp_amount <> 25 or r.tenant_id <> ca or r.reference_id <> q::text then
    raise exception '§7 accepted row %', r;
  end if;
  update community_posts set accepted_comment_id = null, accepted_by = a where id = q;
  update community_posts set accepted_comment_id = c_q, accepted_by = a where id = q;
  if (select n from pg_temp.xp(b, 'community_answer_accepted')) <> 1 then
    raise exception '§7 re-accepting earned twice';
  end if;
  raise notice 'PASS §7 accepted answer once per question, never self';

  -- §8 XP reaches the school's gamification profile (what leagues/leaderboards read)
  if not exists (select 1 from gamification_profiles where user_id = b and tenant_id = ca and total_xp > 0) then
    raise exception '§8 no Code Academy profile XP for B';
  end if;
  raise notice 'PASS §8 profile XP in the right school';

  -- §9 none of the new functions is a client API
  if has_function_privilege('authenticated', 'public.community_award_xp(uuid, uuid, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.community_award_xp(uuid, uuid, text, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.community_xp_rule(text)', 'execute')
     or has_function_privilege('authenticated', 'public.community_on_answer_accepted()', 'execute') then
    raise exception '§9 a community XP function is callable by clients';
  end if;
  raise notice 'PASS §9 privileges';


  -- §10 a failing award never blocks posting
  create or replace function public.community_award_xp(_user_id uuid, _tenant_id uuid, _action text, _reference_id text, _reference_type text)
  returns integer language plpgsql as 'begin raise exception ''boom''; end';
  select count(*) into total_before from community_comments where post_id = sp;
  insert into community_comments (tenant_id, post_id, author_id, content) values (ca, sp, t, 'still posts');
  insert into community_posts (tenant_id, author_id, course_id, post_type, content) values (ca, t, 2001, 'standard', 'still posts');
  insert into community_reactions (tenant_id, user_id, post_id, reaction_type) values (ca, t, q, 'helpful');
  if (select count(*) from community_comments where post_id = sp) <> total_before + 1 then
    raise exception '§10 comment insert was blocked';
  end if;
  raise notice 'PASS §10 XP failure never blocks posting';

  raise notice 'issue-874 community XP: all checks passed';
end $$;

rollback;
