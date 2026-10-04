-- Issue #876 — community @mentions and the realtime publication.
-- Rolled back. Who counts as mentioned, who is told, retraction on edit/hide,
-- and the autocomplete RPC live in SQL (the native app and the MCP server write
-- through RLS); these are their unit tests. The web parsing/rendering is
-- covered by tests/unit/community-mentions.test.ts, the live feed end to end by
-- tests/playwright/community-realtime-mentions.spec.ts.
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off \
--     -v ON_ERROR_STOP=1 < tests/sql/issue-876-community-mentions.sql
--
-- Cast (seed): A = Alice (Code Academy student, enrolled in 2001), B =
-- student@e2etest.com added to Code Academy with access to and an enrollment in
-- 2001, T = creator@codeacademy.com (Code Academy admin), C =
-- owner@e2etest.com (Default School only — another school), D = a throwaway
-- Code Academy student with no access to 2001.
begin;

create function pg_temp.tok(_name text, _id uuid) returns text
language sql immutable as $$ select format('[@%s](mention:%s)', _name, _id) $$;

-- The mention notifications _user has about _post, newest first.
create function pg_temp.mention_rows(_post uuid, _user uuid)
returns table (nid bigint, title text, content text, metadata jsonb, dismissed boolean, push_sent boolean)
language sql as $$
  select n.id, n.title, n.content, n.metadata, un.dismissed, un.push_sent
    from notifications n
    join user_notifications un on un.notification_id = n.id and un.user_id = _user
   where n.community_post_id = _post
     and n.notification_type = 'community'
     and n.metadata ->> 'kind' = 'community_mention'
   order by n.id desc
$$;

create function pg_temp.mentioned(_post uuid, _comment uuid) returns uuid[]
language sql as $$
  select coalesce(array_agg(mentioned_user_id order by mentioned_user_id), '{}')
    from community_mentions
   where post_id = _post and comment_id is not distinct from _comment
$$;

do $$
declare
  ca  constant uuid := '00000000-0000-0000-0000-000000000002';
  def constant uuid := '00000000-0000-0000-0000-000000000001';
  a   constant uuid := 'a1000000-0000-0000-0000-000000000004';
  b   constant uuid := 'a1000000-0000-0000-0000-000000000001';
  t   constant uuid := 'a1000000-0000-0000-0000-000000000003';
  c   constant uuid := 'a1000000-0000-0000-0000-000000000002';
  d   constant uuid := '87600000-0000-0000-0000-00000000000d';
  ghost constant uuid := '87600000-0000-0000-0000-0000000000ff';
  p1  constant uuid := '87600000-0000-0000-0000-000000000101';
  p2  constant uuid := '87600000-0000-0000-0000-000000000102';
  p3  constant uuid := '87600000-0000-0000-0000-000000000103';
  p4  constant uuid := '87600000-0000-0000-0000-000000000104';
  c1  constant uuid := '87600000-0000-0000-0000-000000000201';
  c2  constant uuid := '87600000-0000-0000-0000-000000000202';
  c3  constant uuid := '87600000-0000-0000-0000-000000000203';
  c4  constant uuid := '87600000-0000-0000-0000-000000000204';
  r record;
  ids uuid[];
  n integer;
  got text;
begin
  -- ---------------------------------------------------------------- setup
  update user_notifications set push_sent = true, push_sent_at = now() - interval '1 hour'
   where push_sent = false or push_sent_at > now() - interval '15 minutes';
  delete from notification_preferences where user_id in (a, b, c, t);
  delete from community_user_blocks where blocker_id in (a, b, c, t) or blocked_id in (a, b, c, t);
  delete from community_user_mutes where tenant_id = ca;
  delete from tenant_users where tenant_id = ca and user_id = c;

  insert into tenant_users (tenant_id, user_id, role, status) values (ca, b, 'student', 'active')
  on conflict (tenant_id, user_id) do update set role = 'student', status = 'active';
  insert into entitlements (user_id, course_id, tenant_id, source_type) values (b, 2001, ca, 'admin_grant')
  on conflict do nothing;
  insert into enrollments (user_id, course_id, status, tenant_id) values (b, 2001, 'active', ca)
  on conflict (user_id, course_id) do update set status = 'active', tenant_id = ca;

  -- Fires handle_new_user(); the profile is rolled back with everything else.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (d, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd-876@example.test', '',
          now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Dana NoAccess"}', now(), now());
  update profiles set full_name = 'Dana NoAccess' where id = d;
  insert into tenant_users (tenant_id, user_id, role, status) values (ca, d, 'student', 'active');

  if not community_enabled(ca) then raise exception 'setup: Code Academy has no community'; end if;
  if not has_course_access(a, 2001) or not has_course_access(b, 2001) or has_course_access(d, 2001) then
    raise exception 'setup: unexpected access';
  end if;

  -- §0 realtime: posts and comments are published, reactions are not
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'community_posts')
     or not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'community_comments') then
    raise exception '§0 posts/comments not in supabase_realtime';
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'community_reactions') then
    raise exception '§0 community_reactions is published (its SELECT policy is tenant-wide)';
  end if;

  -- §1 parsing: only the composer's form, distinct, in order, capped
  ids := community_parse_mentions(
    'hi ' || pg_temp.tok('Bee', b) || ' and ' || pg_temp.tok('Tee', t) || ' again ' || pg_temp.tok('B2', b)
    || ' @plain [Bee](mention:' || b || ') [@x](https://evil.test) [@y](mention:not-a-uuid)', 10);
  if ids <> array[b, t] then raise exception '§1 parse %', ids; end if;
  if cardinality(community_parse_mentions(pg_temp.tok('a', a) || pg_temp.tok('b', b) || pg_temp.tok('t', t), 2)) <> 2 then
    raise exception '§1 cap';
  end if;
  if community_parse_mentions(null, 10) <> '{}' or community_parse_mentions('no mentions', 10) <> '{}' then
    raise exception '§1 empty';
  end if;
  -- upper-case ids are normalized
  if community_parse_mentions('[@Bee](mention:' || upper(b::text) || ')', 10) <> array[b] then
    raise exception '§1 case';
  end if;

  -- §2 a course post: only members who can see it are mentioned, and told
  insert into community_posts (id, tenant_id, author_id, course_id, title, content)
  values (p1, ca, a, 2001, 'Loops', 'Help ' || pg_temp.tok('Test Student', b) || ' ' || pg_temp.tok('Creator', t)
          || ' ' || pg_temp.tok('Owner', c) || ' ' || pg_temp.tok('Dana', d) || ' ' || pg_temp.tok('Ghost', ghost)
          || ' ' || pg_temp.tok('Me', a));
  if pg_temp.mentioned(p1, null) <> (select array_agg(x order by x) from unnest(array[b, t]) x) then
    raise exception '§2 mentioned %', pg_temp.mentioned(p1, null);
  end if;
  select * into r from pg_temp.mention_rows(p1, b) limit 1;
  if r.nid is null then raise exception '§2 B not told'; end if;
  if r.metadata ->> 'target' <> 'post' or r.metadata ->> 'comment_id' is not null
     or r.metadata ->> 'post_id' <> p1::text or (r.metadata ->> 'course_id')::int <> 2001
     or r.metadata ->> 'actor_id' <> a::text or r.metadata ->> 'actor_name' <> 'Alice Student' then
    raise exception '§2 metadata %', r.metadata;
  end if;
  -- the push text shows the name, never the raw token
  if r.content not like 'Alice Student: Help @Test Student @Creator%' or r.content like '%mention:%' then
    raise exception '§2 content "%"', r.content;
  end if;
  if r.title <> 'Loops' or r.push_sent is not false then raise exception '§2 title/push % %', r.title, r.push_sent; end if;
  if not exists (select 1 from pg_temp.mention_rows(p1, t)) then raise exception '§2 T not told'; end if;
  if exists (select 1 from pg_temp.mention_rows(p1, c)) or exists (select 1 from pg_temp.mention_rows(p1, d))
     or exists (select 1 from pg_temp.mention_rows(p1, a)) then
    raise exception '§2 told someone who cannot see the post';
  end if;

  -- §3 a comment: the post author hears it as a reply (#870), not twice
  insert into community_comments (id, tenant_id, post_id, author_id, content)
  values (c1, ca, p1, b, 'Try this ' || pg_temp.tok('Alice', a) || ' cc ' || pg_temp.tok('Creator', t));
  if pg_temp.mentioned(p1, c1) <> (select array_agg(x order by x) from unnest(array[a, t]) x) then
    raise exception '§3 mentioned %', pg_temp.mentioned(p1, c1);
  end if;
  if exists (select 1 from pg_temp.mention_rows(p1, a)) then raise exception '§3 post author told twice'; end if;
  if not exists (select 1 from notifications n join user_notifications un on un.notification_id = n.id and un.user_id = a
                  where n.community_post_id = p1 and n.metadata ->> 'kind' = 'community_reply') then
    raise exception '§3 post author got no reply notification';
  end if;
  select * into r from pg_temp.mention_rows(p1, t) limit 1;
  if r.metadata ->> 'target' <> 'comment' or r.metadata ->> 'comment_id' <> c1::text then
    raise exception '§3 T comment mention %', r.metadata;
  end if;
  -- ... and inside the 15-minute window it is in-app only
  if r.push_sent is not true then raise exception '§3 second mention push not rate-limited'; end if;

  -- §4 through RLS (native app / MCP): the definer trigger still fires
  perform set_config('request.jwt.claims', json_build_object(
    'sub', b, 'role', 'authenticated', 'tenant_id', ca, 'tenant_role', 'student')::text, true);
  set local role authenticated;
  insert into community_comments (id, tenant_id, post_id, author_id, content)
  values (c2, ca, p1, b, 'rls ' || pg_temp.tok('Creator', t));
  -- a client can read its own mentions but never write one
  if not exists (select 1 from community_mentions where comment_id = c2) then raise exception '§4 author cannot read own mention'; end if;
  begin
    insert into community_mentions (tenant_id, post_id, mentioned_user_id, author_id) values (ca, p1, t, b);
    raise exception '§4 client inserted a mention';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from community_mentions where comment_id = c2;
    raise exception '§4 client deleted a mention';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if pg_temp.mentioned(p1, c2) <> array[t] then raise exception '§4 RLS path %', pg_temp.mentioned(p1, c2); end if;

  -- §5 blocks: no mention across a block, either way, nor of someone who blocked the post author
  insert into community_user_blocks (blocker_id, blocked_id) values (t, b);
  insert into community_comments (id, tenant_id, post_id, author_id, content)
  values (c3, ca, p1, b, 'blocked ' || pg_temp.tok('Creator', t));
  if pg_temp.mentioned(p1, c3) <> '{}' then raise exception '§5 mention across a block'; end if;
  delete from community_user_blocks where blocker_id = t;
  insert into community_user_blocks (blocker_id, blocked_id) values (t, a);   -- T blocked the post author
  insert into community_comments (id, tenant_id, post_id, author_id, content)
  values (c4, ca, p1, b, 'post author blocked ' || pg_temp.tok('Creator', t));
  if pg_temp.mentioned(p1, c4) <> '{}' then raise exception '§5 mentioned someone who blocked the post author'; end if;
  delete from community_user_blocks where blocker_id = t;

  -- §6 preference off: recorded, not told
  insert into notification_preferences (user_id, community_mentions) values (t, false);
  insert into community_posts (id, tenant_id, author_id, course_id, content)
  values (p2, ca, a, null, 'school ' || pg_temp.tok('Creator', t) || ' ' || pg_temp.tok('Dana', d));
  -- the school feed: D (no course access) is a member, so she is mentioned
  if pg_temp.mentioned(p2, null) <> (select array_agg(x order by x) from unnest(array[t, d]) x) then
    raise exception '§6 school post mentioned %', pg_temp.mentioned(p2, null);
  end if;
  if exists (select 1 from pg_temp.mention_rows(p2, t)) then raise exception '§6 preference ignored'; end if;
  if not exists (select 1 from pg_temp.mention_rows(p2, d)) then raise exception '§6 D not told'; end if;
  delete from notification_preferences where user_id = t;

  -- §7 edit: a mention taken out goes, with its notification; a new one is added and told once
  update community_posts
     set content = 'school ' || pg_temp.tok('Creator', t) || ' ' || pg_temp.tok('Test Student', b)
   where id = p2;
  if pg_temp.mentioned(p2, null) <> (select array_agg(x order by x) from unnest(array[b, t]) x) then
    raise exception '§7 after edit %', pg_temp.mentioned(p2, null);
  end if;
  if exists (select 1 from pg_temp.mention_rows(p2, d)) then raise exception '§7 removed mention still notified'; end if;
  if (select count(*) from pg_temp.mention_rows(p2, b)) <> 1 then raise exception '§7 B not told once'; end if;
  -- T was already mentioned before the edit: not told again (and never told, prefs were off then)
  if exists (select 1 from pg_temp.mention_rows(p2, t)) then raise exception '§7 existing mention re-notified'; end if;
  update community_posts set content = content || ' edited' where id = p2;
  if (select count(*) from pg_temp.mention_rows(p2, b)) <> 1 then raise exception '§7 unrelated edit re-notified'; end if;

  -- §8 hiding the comment scrubs the mention notification that quotes it (#870 retraction)
  update community_comments set is_hidden = true where id = c2;
  select * into r from pg_temp.mention_rows(p1, t) where metadata ->> 'mention_id' in
    (select id::text from community_mentions where comment_id = c2);
  if not found then raise exception '§8 mention notification vanished'; end if;
  if r.dismissed is not true or r.metadata ? 'snippet' or r.metadata ? 'comment_id' or r.metadata ? 'actor_name'
     or r.content <> 'Loops' then
    raise exception '§8 hidden comment still named: % "%" %', r.metadata, r.content, r.dismissed;
  end if;
  if exists (select 1 from notifications where community_post_id = p1 and metadata ->> 'kind' = 'community_mention'
              and content like '%rls @Creator%') then
    raise exception '§8 hidden comment text survives';
  end if;
  -- hiding the post deletes every notification about it
  update community_posts set is_hidden = true where id = p1;
  if exists (select 1 from notifications where community_post_id = p1) then raise exception '§8 post hidden, notifications left'; end if;

  -- §9 a muted author mentions (recorded) but tells nobody; community off likewise
  insert into community_user_mutes (tenant_id, user_id, muted_by) values (ca, a, t);
  insert into community_posts (id, tenant_id, author_id, course_id, content)
  values (p3, ca, a, null, 'muted ' || pg_temp.tok('Test Student', b));
  if exists (select 1 from pg_temp.mention_rows(p3, b)) then raise exception '§9 muted author notified'; end if;
  delete from community_user_mutes where tenant_id = ca;

  -- §10 another school: C is not a Code Academy member; a Default School post
  -- in a school without community records the mention but tells nobody
  insert into community_posts (id, tenant_id, author_id, course_id, content)
  values (p4, def, c, null, 'hi ' || pg_temp.tok('Test Student', b) || ' ' || pg_temp.tok('Alice', a));
  if pg_temp.mentioned(p4, null) <> array[b] then raise exception '§10 cross-school mention %', pg_temp.mentioned(p4, null); end if;
  if not community_enabled(def) and exists (select 1 from pg_temp.mention_rows(p4, b)) then
    raise exception '§10 told in a school without community';
  end if;

  -- §11 autocomplete, as B in Code Academy
  perform set_config('request.jwt.claims', json_build_object(
    'sub', b, 'role', 'authenticated', 'tenant_id', ca, 'tenant_role', 'student')::text, true);
  set local role authenticated;
  -- course 2001: staff and enrolled students with access; not D, not C, not B herself
  select array_agg(user_id order by user_id) into ids from community_mention_candidates(ca, 2001, null, '');
  if ids <> (select array_agg(x order by x) from unnest(array[a, t]) x) then raise exception '§11 course candidates %', ids; end if;
  -- the school feed: every member
  select array_agg(user_id order by user_id) into ids from community_mention_candidates(ca, null, null, '');
  if not (d = any(ids)) or c = any(ids) or b = any(ids) then raise exception '§11 school candidates %', ids; end if;
  -- a reply on a post takes the post's course
  insert into community_posts (id, tenant_id, author_id, course_id, content) values
    ('87600000-0000-0000-0000-000000000105', ca, b, 2001, 'rls post');
  select array_agg(user_id order by user_id) into ids
    from community_mention_candidates(ca, null, '87600000-0000-0000-0000-000000000105', '');
  if d = any(ids) then raise exception '§11 reply candidates leak the course %', ids; end if;
  -- name filter, prefix first, LIKE wildcards are literal
  select array_agg(full_name) into got from community_mention_candidates(ca, null, null, 'ali');
  if got is distinct from '{"Alice Student"}' then raise exception '§11 filter %', got; end if;
  if exists (select 1 from community_mention_candidates(ca, null, null, '%')) then raise exception '§11 wildcard'; end if;
  if (select count(*) from community_mention_candidates(ca, null, null, '', 100)) > 8 then raise exception '§11 limit'; end if;
  -- another school, or a course of another school: nothing
  reset role;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', a, 'role', 'authenticated', 'tenant_id', ca, 'tenant_role', 'student')::text, true);
  set local role authenticated;
  if exists (select 1 from community_mention_candidates(def, null, null, '')) then raise exception '§11 non-member got another school'; end if;
  if exists (select 1 from community_mention_candidates(ca, 1, null, '')) and not exists (select 1 from courses where course_id = 1 and tenant_id = ca) then
    raise exception '§11 another school''s course';
  end if;
  -- blocks hide candidates both ways
  reset role;
  insert into community_user_blocks (blocker_id, blocked_id) values (t, a);
  set local role authenticated;
  if exists (select 1 from community_mention_candidates(ca, null, null, '') where user_id = t) then
    raise exception '§11 blocked member offered';
  end if;
  reset role;
  delete from community_user_blocks where blocker_id = t;
  -- a student without access to the course gets no candidates for it
  perform set_config('request.jwt.claims', json_build_object(
    'sub', d, 'role', 'authenticated', 'tenant_id', ca, 'tenant_role', 'student')::text, true);
  set local role authenticated;
  if exists (select 1 from community_mention_candidates(ca, 2001, null, '')) then raise exception '§11 no-access caller got candidates'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- §12 anon cannot call the RPC; internal helpers are not client APIs
  if has_function_privilege('anon', 'public.community_mention_candidates(uuid, integer, uuid, text, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.community_sync_mentions(uuid, uuid, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.community_notify_mention(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.community_mention_eligible(uuid, uuid, integer, uuid, uuid)', 'execute') then
    raise exception '§12 privileges';
  end if;

  raise notice 'issue-876 community mentions: all checks passed';
end $$;

rollback;
