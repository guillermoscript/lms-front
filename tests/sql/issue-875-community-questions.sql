-- Issue #875 — questions with an accepted answer: who may accept, what may be
-- accepted, and what accepting sets off. Rolled back.
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off \
--     -v ON_ERROR_STOP=1 < tests/sql/issue-875-community-questions.sql
--
-- Cast (seed): A = Alice (Code Academy student, access to 2001) asks;
-- B = student@e2etest.com added to Code Academy with access to 2001 answers;
-- T = creator@codeacademy.com (Code Academy admin).
begin;

-- Act as a member through RLS (the native app / MCP path).
create function pg_temp.act_as(_user uuid, _role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', _user, 'role', 'authenticated',
    'tenant_id', '00000000-0000-0000-0000-000000000002', 'tenant_role', _role)::text, true);
  set local role authenticated;
end $$;

-- Back to the service role's shoes: no JWT user.
create function pg_temp.act_as_system() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.accepted(_post uuid) returns uuid language sql as $$
  select accepted_comment_id from public.community_posts where id = _post
$$;

do $$
declare
  ca  constant uuid := '00000000-0000-0000-0000-000000000002';
  a   constant uuid := 'a1000000-0000-0000-0000-000000000004';
  b   constant uuid := 'a1000000-0000-0000-0000-000000000001';
  t   constant uuid := 'a1000000-0000-0000-0000-000000000003';
  q   constant uuid := '87500000-0000-0000-0000-000000000001';
  q2  constant uuid := '87500000-0000-0000-0000-000000000002';
  sp  constant uuid := '87500000-0000-0000-0000-000000000003';
  c_b constant uuid := '87500000-0000-0000-0000-000000000101'; -- B's answer on q
  c_r constant uuid := '87500000-0000-0000-0000-000000000102'; -- a reply under it
  c_t constant uuid := '87500000-0000-0000-0000-000000000103'; -- T's answer on q
  c_x constant uuid := '87500000-0000-0000-0000-000000000104'; -- B's answer on q2
  c_s constant uuid := '87500000-0000-0000-0000-000000000105'; -- a comment on a standard post
  n int;
  refused boolean;
  r record;
begin
  -- ---------------------------------------------------------------- setup
  delete from community_user_mutes where tenant_id = ca;
  delete from community_user_blocks where blocker_id in (a, b, t) or blocked_id in (a, b, t);
  delete from notification_preferences where user_id in (a, b, t);
  insert into tenant_users (tenant_id, user_id, role, status) values (ca, b, 'student', 'active')
  on conflict (tenant_id, user_id) do update set role = 'student', status = 'active';
  insert into entitlements (user_id, course_id, tenant_id, source_type) values (b, 2001, ca, 'admin_grant')
  on conflict do nothing;
  if not community_enabled(ca) or not has_course_access(a, 2001) or not has_course_access(b, 2001) then
    raise exception 'setup: unexpected access';
  end if;

  -- §1 a student asks a question through RLS
  perform pg_temp.act_as(a, 'student');
  insert into community_posts (id, tenant_id, author_id, course_id, post_type, title, content)
  values (q, ca, a, 2001, 'question', 'Why does my loop never end?', 'while True: ...');
  perform pg_temp.act_as_system();

  insert into community_posts (id, tenant_id, author_id, course_id, post_type, content)
  values (q2, ca, a, 2001, 'question', 'Another question'),
         (sp, ca, a, 2001, 'standard', 'Just a post');
  insert into community_comments (id, tenant_id, post_id, author_id, parent_comment_id, content) values
    (c_b, ca, q, b, null, 'Add a break'),
    (c_r, ca, q, a, c_b, 'Where?'),
    (c_t, ca, q, t, null, 'Use a for loop'),
    (c_x, ca, q2, b, null, 'Other answer'),
    (c_s, ca, sp, b, null, 'Nice');
  raise notice 'PASS §1 student asks a question';

  -- §2 a new post cannot arrive with an accepted answer
  refused := false;
  begin
    insert into community_posts (tenant_id, author_id, course_id, post_type, content, accepted_comment_id)
    values (ca, a, 2001, 'question', 'x', c_b);
  exception when sqlstate '23514' then refused := true;
  end;
  if not refused then raise exception '§2 a post was inserted with an accepted answer'; end if;
  raise notice 'PASS §2 insert carries no accepted answer';

  -- §3 another student cannot accept: RLS finds no row to update ...
  perform pg_temp.act_as(b, 'student');
  update community_posts set accepted_comment_id = c_b where id = q;
  get diagnostics n = row_count;
  perform pg_temp.act_as_system();
  if n <> 0 or pg_temp.accepted(q) is not null then raise exception '§3 another student accepted (% rows)', n; end if;
  -- ... and the service role cannot accept on their behalf either
  refused := false;
  begin
    update community_posts set accepted_comment_id = c_b, accepted_by = b where id = q;
  exception when sqlstate '42501' then refused := true;
  end;
  if not refused then raise exception '§3 service role accepted for another student'; end if;
  -- the service role must say who is acting
  refused := false;
  begin
    update community_posts set accepted_comment_id = c_b where id = q;
  exception when sqlstate '42501' then refused := true;
  end;
  if not refused then raise exception '§3 service role accepted with no actor'; end if;
  raise notice 'PASS §3 other students cannot accept';

  -- §4 the author cannot accept another post's comment, a reply, or on a non-question
  perform pg_temp.act_as(a, 'student');
  refused := false;
  begin
    update community_posts set accepted_comment_id = c_x where id = q;
  exception when sqlstate '23514' then refused := true;
  end;
  if not refused then raise exception '§4 cross-post comment accepted'; end if;
  refused := false;
  begin
    update community_posts set accepted_comment_id = c_r where id = q;
  exception when sqlstate '23514' then refused := true;
  end;
  if not refused then raise exception '§4 a reply was accepted'; end if;
  refused := false;
  begin
    update community_posts set accepted_comment_id = c_s where id = sp;
  exception when sqlstate '23514' then refused := true;
  end;
  if not refused then raise exception '§4 a standard post got an accepted answer'; end if;
  raise notice 'PASS §4 only a top-level comment of the same question';

  -- §5 the author accepts; the trigger records who and when, and B is notified
  update community_posts set accepted_comment_id = c_b where id = q;
  get diagnostics n = row_count;
  perform pg_temp.act_as_system();
  select accepted_comment_id, accepted_by, accepted_at into r from community_posts where id = q;
  if n <> 1 or r.accepted_comment_id <> c_b then raise exception '§5 author could not accept'; end if;
  if r.accepted_by <> a or r.accepted_at is null then
    raise exception '§5 accepted_by % accepted_at %', r.accepted_by, r.accepted_at;
  end if;
  select count(*) into n
    from notifications nt
    join user_notifications un on un.notification_id = nt.id and un.user_id = b
   where nt.community_post_id = q
     and nt.metadata ->> 'kind' = 'community_answer_accepted'
     and nt.metadata ->> 'comment_id' = c_b::text
     and nt.metadata ->> 'actor_id' = a::text;
  if n <> 1 then raise exception '§5 answer author notified % times', n; end if;
  raise notice 'PASS §5 author accepts, answerer notified';

  -- §6 a teacher/admin of the school can switch and clear it
  perform pg_temp.act_as(t, 'admin');
  update community_posts set accepted_comment_id = c_t where id = q;
  get diagnostics n = row_count;
  perform pg_temp.act_as_system();
  select accepted_comment_id, accepted_by into r from community_posts where id = q;
  if n <> 1 or r.accepted_comment_id <> c_t or r.accepted_by <> t then raise exception '§6 staff switch %', r; end if;
  -- T accepted their own answer: nobody to notify
  if exists (select 1 from notifications nt where nt.community_post_id = q
              and nt.metadata ->> 'kind' = 'community_answer_accepted'
              and nt.metadata ->> 'comment_id' = c_t::text) then
    raise exception '§6 self-accept notified';
  end if;
  perform pg_temp.act_as(t, 'admin');
  update community_posts set accepted_comment_id = null where id = q;
  perform pg_temp.act_as_system();
  select accepted_comment_id, accepted_by, accepted_at into r from community_posts where id = q;
  if r.accepted_comment_id is not null or r.accepted_by is not null or r.accepted_at is not null then
    raise exception '§6 clear left %', r;
  end if;
  raise notice 'PASS §6 staff accept and un-accept';

  -- §7 re-accepting never notifies twice (the hook is idempotent per comment)
  update community_posts set accepted_comment_id = c_b, accepted_by = t where id = q;
  select count(*) into n from notifications nt
   where nt.community_post_id = q and nt.metadata ->> 'kind' = 'community_answer_accepted';
  if n <> 1 then raise exception '§7 % accepted notifications', n; end if;
  raise notice 'PASS §7 service role with a valid actor; no double notification';

  -- §8 a muted author cannot accept
  update community_posts set accepted_comment_id = null, accepted_by = t where id = q2;
  insert into community_user_mutes (tenant_id, user_id, muted_by, reason)
  values (ca, a, t, 'test');
  perform pg_temp.act_as(a, 'student');
  refused := false;
  begin
    update community_posts set accepted_comment_id = c_x where id = q2;
  exception when sqlstate '42501' then refused := true;
  end;
  perform pg_temp.act_as_system();
  if not refused then raise exception '§8 a muted author accepted'; end if;
  delete from community_user_mutes where tenant_id = ca and user_id = a;
  raise notice 'PASS §8 muted members cannot accept';

  -- §9 hiding the accepted answer clears it; so does deleting it
  update community_comments set is_hidden = true where id = c_b;
  if pg_temp.accepted(q) is not null then raise exception '§9 hidden answer stayed accepted'; end if;
  update community_posts set accepted_comment_id = c_t, accepted_by = a where id = q;
  delete from community_comments where id = c_t;
  select accepted_comment_id, accepted_by into r from community_posts where id = q;
  if r.accepted_comment_id is not null or r.accepted_by is not null then raise exception '§9 deleted answer stayed accepted'; end if;
  raise notice 'PASS §9 hidden or deleted answers are un-accepted';

  -- §10 none of the new functions is a client API
  if has_function_privilege('authenticated', 'public.community_can_accept_answer(uuid, uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.community_can_accept_answer(uuid, uuid, uuid)', 'execute') then
    raise exception '§10 community_can_accept_answer is callable by clients';
  end if;
  if has_column_privilege('authenticated', 'public.community_posts', 'accepted_by', 'update')
     or has_column_privilege('authenticated', 'public.community_posts', 'post_type', 'update') then
    raise exception '§10 authenticated may write accepted_by / post_type';
  end if;
  raise notice 'PASS §10 privileges';

  raise notice 'issue-875 community questions: all checks passed';
end $$;

rollback;
