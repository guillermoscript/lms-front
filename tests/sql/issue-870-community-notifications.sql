-- Issue #870 — community notifications (replies, prompts, accepted answers).
-- Rolled back. Recipient resolution, batching and retraction live in SQL so the
-- native app and the MCP server get them too; these are their unit tests. The
-- web rendering is covered by tests/unit/community-notifications.test.ts.
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off \
--     -v ON_ERROR_STOP=1 < tests/sql/issue-870-community-notifications.sql
--
-- Cast (seed): A = Alice (Code Academy student, enrolled in 2001), B =
-- student@e2etest.com added to Code Academy with access to and an enrollment in
-- 2001, T = creator@codeacademy.com (Code Academy admin), C = owner@e2etest.com
-- as a Code Academy student with no access.
begin;

create function pg_temp.open_reply(_post uuid, _user uuid)
returns table (
  nid bigint, unid bigint, title text, content text, priority text, metadata jsonb,
  push_sent boolean, push_sent_at timestamptz, created_at timestamptz,
  tenant_id uuid, created_by uuid, target_course_id bigint, target_type text
)
language sql as $$
  select n.id, un.id, n.title, n.content, n.priority, n.metadata,
         un.push_sent, un.push_sent_at, un.created_at,
         n.tenant_id, n.created_by, n.target_course_id, n.target_type
    from notifications n
    join user_notifications un on un.notification_id = n.id and un.user_id = _user
   where n.community_post_id = _post
     and n.notification_type = 'community'
     and un.in_app_read is not true
     and un.dismissed is not true
   order by n.id desc
   limit 1
$$;

create function pg_temp.live(_post uuid, _user uuid) returns integer
language sql as $$
  select count(*)::integer
    from notifications n
    join user_notifications un on un.notification_id = n.id and un.user_id = _user
   where n.community_post_id = _post
     and n.notification_type = 'community'
     and un.in_app_read is not true
     and un.dismissed is not true
$$;

create function pg_temp.say(_id uuid, _post uuid, _author uuid, _parent uuid default null,
                            _tenant uuid default '00000000-0000-0000-0000-000000000002',
                            _hidden boolean default false)
returns void language sql as $$
  insert into community_comments (id, tenant_id, post_id, author_id, parent_comment_id, content, is_hidden)
  values (_id, _tenant, _post, _author, _parent, 'reply ' || right(_id::text, 3), _hidden)
$$;

create function pg_temp.prompt_audience(_post uuid) returns uuid[]
language sql as $$
  select coalesce(array_agg(un.user_id order by un.user_id), '{}')
    from notifications n
    join user_notifications un on un.notification_id = n.id
   where n.community_post_id = _post
     and n.metadata ->> 'kind' = 'community_prompt'
$$;

do $$
declare
  ca  constant uuid := '00000000-0000-0000-0000-000000000002';
  def constant uuid := '00000000-0000-0000-0000-000000000001';
  a   constant uuid := 'a1000000-0000-0000-0000-000000000004';
  b   constant uuid := 'a1000000-0000-0000-0000-000000000001';
  t   constant uuid := 'a1000000-0000-0000-0000-000000000003';
  c   constant uuid := 'a1000000-0000-0000-0000-000000000002';
  p1  constant uuid := '87000000-0000-0000-0000-000000000101';
  p2  constant uuid := '87000000-0000-0000-0000-000000000102';
  p3  constant uuid := '87000000-0000-0000-0000-000000000103';
  p4  constant uuid := '87000000-0000-0000-0000-000000000104';
  p5  constant uuid := '87000000-0000-0000-0000-000000000105';
  p6  constant uuid := '87000000-0000-0000-0000-000000000106';
  p7  constant uuid := '87000000-0000-0000-0000-000000000107';
  p8  constant uuid := '87000000-0000-0000-0000-000000000108';
  p9  constant uuid := '87000000-0000-0000-0000-000000000109';
  r record;
  n_first bigint;
  n_planted bigint;
  n_id bigint;
  v integer;
  f text;
  audience uuid[];
begin
  -- ---------------------------------------------------------------- setup
  -- Nothing queued and no push inside the 15-minute window, whatever other runs left.
  update user_notifications set push_sent = true, push_sent_at = now() - interval '1 hour'
   where push_sent = false or push_sent_at > now() - interval '15 minutes';
  delete from notification_preferences where user_id in (a, b, c, t);
  delete from community_user_blocks where blocker_id in (a, b, c, t) or blocked_id in (a, b, c, t);
  delete from community_user_mutes where tenant_id = ca;

  insert into tenant_users (tenant_id, user_id, role, status) values (ca, b, 'student', 'active'), (ca, c, 'student', 'active')
  on conflict (tenant_id, user_id) do update set role = 'student', status = 'active';
  insert into entitlements (user_id, course_id, tenant_id, source_type) values (b, 2001, ca, 'admin_grant')
  on conflict do nothing;
  insert into enrollments (user_id, course_id, status, tenant_id) values (b, 2001, 'active', ca)
  on conflict (user_id, course_id) do update set status = 'active', tenant_id = ca;

  if not community_enabled(ca) then raise exception 'setup: Code Academy has no community'; end if;
  if community_enabled(def) then raise exception 'setup: Default School unexpectedly has community'; end if;
  if not has_course_access(a, 2001) or not has_course_access(b, 2001) or has_course_access(c, 2001) then
    raise exception 'setup: unexpected access';
  end if;

  insert into community_posts (id, tenant_id, author_id, course_id, title, content)
  values (p1, ca, a, 2001, '  Help with loops  ', 'My for loop never ends');

  -- §1 a comment notifies the post author, once, with everything the link needs
  perform pg_temp.say('87000000-0000-0000-0000-000000000201', p1, b);
  select * into r from pg_temp.open_reply(p1, a);
  if r.nid is null then raise exception '§1 no notification for the post author'; end if;
  n_first := r.nid;
  if r.metadata ->> 'kind' <> 'community_reply' or r.metadata ->> 'reply_to' <> 'post'
     or (r.metadata ->> 'count')::int <> 1 then
    raise exception '§1 metadata %', r.metadata;
  end if;
  if r.metadata ->> 'post_id' <> p1::text or r.metadata ->> 'comment_id' <> '87000000-0000-0000-0000-000000000201'
     or (r.metadata ->> 'course_id')::int <> 2001 or r.metadata ->> 'actor_id' <> b::text
     or r.metadata ->> 'actor_name' <> 'Test Student' or r.metadata ->> 'snippet' <> 'reply 201' then
    raise exception '§1 ids %', r.metadata;
  end if;
  if r.tenant_id <> ca or r.target_course_id <> 2001 or r.target_type <> 'user' or r.created_by is not null then
    raise exception '§1 row % % % %', r.tenant_id, r.target_course_id, r.target_type, r.created_by;
  end if;
  if r.title <> 'Help with loops' or r.content <> 'Test Student: reply 201' or r.priority <> 'normal' then
    raise exception '§1 text "%" "%" %', r.title, r.content, r.priority;
  end if;
  if r.push_sent is distinct from false then raise exception '§1 push not queued'; end if;
  if pg_temp.live(p1, b) <> 0 then raise exception '§1 the replier was notified'; end if;

  -- §2 through RLS (native app / MCP): the definer trigger still fires, and batches
  perform set_config('request.jwt.claims', json_build_object(
    'sub', b, 'role', 'authenticated', 'tenant_id', ca, 'tenant_role', 'student')::text, true);
  set local role authenticated;
  insert into community_comments (id, tenant_id, post_id, author_id, content)
  values ('87000000-0000-0000-0000-000000000202', ca, p1, b, 'reply 202');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select * into r from pg_temp.open_reply(p1, a);
  if r.nid <> n_first or (r.metadata ->> 'count')::int <> 2 or r.title <> '(2) Help with loops'
     or r.metadata ->> 'comment_id' <> '87000000-0000-0000-0000-000000000202' then
    raise exception '§2 not batched: % % %', r.nid, r.title, r.metadata;
  end if;
  if pg_temp.live(p1, a) <> 1 then raise exception '§2 more than one open row'; end if;

  -- §3 your own comment notifies nobody
  perform pg_temp.say('87000000-0000-0000-0000-000000000203', p1, a);
  select * into r from pg_temp.open_reply(p1, a);
  if (r.metadata ->> 'count')::int <> 2 then raise exception '§3 self comment counted'; end if;

  -- §4 a reply to A's comment: one notification, reply_to 'comment' wins over 'post'.
  -- The row's push is still queued, so it keeps its place in the push queue
  -- (created_at is claim_pending_pushes' order) instead of moving to the back.
  update user_notifications set created_at = now() - interval '5 minutes' where id = r.unid;
  perform pg_temp.say('87000000-0000-0000-0000-000000000204', p1, b, '87000000-0000-0000-0000-000000000203');
  select * into r from pg_temp.open_reply(p1, a);
  if (r.metadata ->> 'count')::int <> 3 or r.metadata ->> 'reply_to' <> 'comment' then
    raise exception '§4 % ', r.metadata;
  end if;
  if r.push_sent is not false or r.created_at <> now() - interval '5 minutes' then
    raise exception '§4 a queued push lost its place: % %', r.push_sent, r.created_at;
  end if;

  -- §5 push: claimed once with the ids; inside 15 minutes no re-arm; after, re-armed
  select * into r from claim_pending_pushes(25, interval '1 day');
  if r.notification_id <> n_first or r.kind <> 'community_reply' then raise exception '§5 claimed % %', r.notification_id, r.kind; end if;
  if r.data ->> 'tenant_id' <> ca::text or r.data ->> 'post_id' <> p1::text
     or r.data ->> 'comment_id' <> '87000000-0000-0000-0000-000000000204' or (r.data ->> 'course_id')::int <> 2001 then
    raise exception '§5 data %', r.data;
  end if;
  if r.title <> '(3) Help with loops' then raise exception '§5 push title %', r.title; end if;
  if (select count(*) from claim_pending_pushes(25, interval '1 day')) <> 0 then raise exception '§5 claimed twice'; end if;

  perform pg_temp.say('87000000-0000-0000-0000-000000000205', p1, b);
  select * into r from pg_temp.open_reply(p1, a);
  if (r.metadata ->> 'count')::int <> 4 or r.push_sent is not true then raise exception '§5 re-armed inside the cooldown'; end if;

  update user_notifications set push_sent_at = now() - interval '16 minutes', created_at = now() - interval '1 hour'
   where id = r.unid;
  perform pg_temp.say('87000000-0000-0000-0000-000000000206', p1, b);
  select * into r from pg_temp.open_reply(p1, a);
  if (r.metadata ->> 'count')::int <> 5 or r.push_sent is not false or r.push_sent_at is not null then
    raise exception '§5 not re-armed after the cooldown: % % %', r.metadata ->> 'count', r.push_sent, r.push_sent_at;
  end if;
  if r.created_at <> now() then raise exception '§5 created_at not bumped'; end if;

  -- §6 once read, the next reply opens a new row — in-app only inside the cooldown
  perform count(*) from claim_pending_pushes(25, interval '1 day');
  update user_notifications set in_app_read = true, in_app_read_at = now() where id = r.unid;
  perform pg_temp.say('87000000-0000-0000-0000-000000000207', p1, b);
  select * into r from pg_temp.open_reply(p1, a);
  if r.nid = n_first or (r.metadata ->> 'count')::int <> 1 or r.title <> 'Help with loops' then
    raise exception '§6 % %', r.nid, r.metadata;
  end if;
  if r.push_sent is not true then raise exception '§6 cooldown ignored'; end if;

  -- §7 a staff reply is high priority and says so
  perform pg_temp.say('87000000-0000-0000-0000-000000000208', p1, t);
  select * into r from pg_temp.open_reply(p1, a);
  if (r.metadata ->> 'count')::int <> 2 or r.priority <> 'high' or r.metadata ->> 'staff_reply' <> 'true'
     or r.metadata ->> 'actor_role' <> 'admin' then
    raise exception '§7 % %', r.priority, r.metadata;
  end if;

  -- §7b a third member replies to B's comment on A's post: B is told about their
  -- comment, A about their post — one row each
  insert into community_posts (id, tenant_id, author_id, course_id, title, content)
  values (p7, ca, a, 2001, 'Parent and post', 'x');
  perform pg_temp.say('87000000-0000-0000-0000-000000000251', p7, b);
  perform pg_temp.say('87000000-0000-0000-0000-000000000252', p7, t, '87000000-0000-0000-0000-000000000251');
  select * into r from pg_temp.open_reply(p7, b);
  if r.nid is null or r.metadata ->> 'reply_to' <> 'comment' or (r.metadata ->> 'count')::int <> 1
     or r.metadata ->> 'comment_id' <> '87000000-0000-0000-0000-000000000252' then
    raise exception '§7b parent author: %', r.metadata;
  end if;
  select * into r from pg_temp.open_reply(p7, a);
  if r.nid is null or r.metadata ->> 'reply_to' <> 'post' or (r.metadata ->> 'count')::int <> 2
     or r.metadata ->> 'comment_id' <> '87000000-0000-0000-0000-000000000252' then
    raise exception '§7b post author: %', r.metadata;
  end if;
  if pg_temp.live(p7, t) <> 0 then raise exception '§7b the replier was notified'; end if;

  -- §8 blocks, either direction; a new block retracts the blocked member's notifications
  insert into community_user_blocks (blocker_id, blocked_id) values (a, b);
  perform pg_temp.say('87000000-0000-0000-0000-000000000209', p1, b);
  if (select (metadata ->> 'count')::int from pg_temp.open_reply(p1, a)) <> 2 then raise exception '§8 A blocked B, still notified'; end if;
  delete from community_user_blocks where blocker_id = a;
  insert into community_user_blocks (blocker_id, blocked_id) values (b, a);
  perform pg_temp.say('87000000-0000-0000-0000-000000000210', p1, b);
  if (select (metadata ->> 'count')::int from pg_temp.open_reply(p1, a)) <> 2 then raise exception '§8 B blocked A, still notified'; end if;
  delete from community_user_blocks where blocker_id = b;
  perform pg_temp.say('87000000-0000-0000-0000-000000000211', p1, b);
  if (select (metadata ->> 'count')::int from pg_temp.open_reply(p1, a)) <> 3 then raise exception '§8 unblocked, not notified'; end if;
  insert into community_user_blocks (blocker_id, blocked_id) values (a, b);
  if pg_temp.live(p1, a) <> 0 then raise exception '§8 block did not retract'; end if;
  delete from community_user_blocks where blocker_id = a;

  -- §8b a post by someone you blocked is hidden from you: a reply to your comment
  -- on it neither reaches you, nor stays in your list once you block its author
  insert into community_posts (id, tenant_id, author_id, course_id, title, content)
  values (p8, ca, a, 2001, 'Blocked author''s post', 'x');
  perform pg_temp.say('87000000-0000-0000-0000-000000000261', p8, b);
  perform pg_temp.say('87000000-0000-0000-0000-000000000262', p8, t, '87000000-0000-0000-0000-000000000261');
  if pg_temp.live(p8, b) <> 1 then raise exception '§8b setup: B not told about the reply'; end if;
  insert into community_user_blocks (blocker_id, blocked_id) values (b, a);
  if pg_temp.live(p8, b) <> 0 then raise exception '§8b blocking the post author did not retract'; end if;
  perform pg_temp.say('87000000-0000-0000-0000-000000000263', p8, t, '87000000-0000-0000-0000-000000000261');
  if pg_temp.live(p8, b) <> 0 then raise exception '§8b notified about a blocked author''s post'; end if;
  if pg_temp.live(p8, a) <> 1 then raise exception '§8b the post author was not notified'; end if;
  delete from community_user_blocks where blocker_id = b;

  -- §9 preferences: replies off, or in-app off, means nothing at all
  insert into notification_preferences (user_id, community_replies) values (a, false);
  perform pg_temp.say('87000000-0000-0000-0000-000000000212', p1, b);
  if pg_temp.live(p1, a) <> 0 then raise exception '§9 replies off, still notified'; end if;
  update notification_preferences set community_replies = true, in_app_enabled = false where user_id = a;
  perform pg_temp.say('87000000-0000-0000-0000-000000000213', p1, b);
  if pg_temp.live(p1, a) <> 0 then raise exception '§9 in-app off, still notified'; end if;
  delete from notification_preferences where user_id = a;

  -- §10 hidden, mismatched, unreachable, muted, community off
  perform pg_temp.say('87000000-0000-0000-0000-000000000214', p1, b, null, ca, true);
  if pg_temp.live(p1, a) <> 0 then raise exception '§10 hidden comment notified'; end if;

  insert into community_posts (id, tenant_id, author_id, course_id, content, is_hidden)
  values (p2, ca, a, 2001, 'removed post', true);
  perform pg_temp.say('87000000-0000-0000-0000-000000000215', p2, b);
  if pg_temp.live(p2, a) <> 0 then raise exception '§10 comment on a hidden post notified'; end if;

  perform pg_temp.say('87000000-0000-0000-0000-000000000216', p1, b, null, def);
  if pg_temp.live(p1, a) <> 0 then raise exception '§10 cross-tenant comment notified'; end if;

  update entitlements set status = 'revoked', revoked_at = now() where user_id = a and course_id = 2001;
  perform pg_temp.say('87000000-0000-0000-0000-000000000217', p1, b);
  if pg_temp.live(p1, a) <> 0 then raise exception '§10 lost access, still notified'; end if;
  update entitlements set status = 'active', revoked_at = null where user_id = a and course_id = 2001;

  update tenant_users set status = 'suspended' where tenant_id = ca and user_id = a;
  perform pg_temp.say('87000000-0000-0000-0000-000000000218', p1, b);
  if pg_temp.live(p1, a) <> 0 then raise exception '§10 inactive member notified'; end if;
  update tenant_users set status = 'active' where tenant_id = ca and user_id = a;

  insert into community_user_mutes (tenant_id, user_id, muted_by) values (ca, b, t);
  perform pg_temp.say('87000000-0000-0000-0000-000000000219', p1, b);
  if pg_temp.live(p1, a) <> 0 then raise exception '§10 muted actor notified'; end if;
  delete from community_user_mutes where tenant_id = ca and user_id = b;

  insert into community_posts (id, tenant_id, author_id, content) values (p3, def, b, 'school without community');
  perform pg_temp.say('87000000-0000-0000-0000-000000000220', p3, c, null, def);
  if pg_temp.live(p3, b) <> 0 then raise exception '§10 school without community notified'; end if;

  -- §11 retracting a comment
  insert into community_posts (id, tenant_id, author_id, course_id, content)
  values (p4, ca, a, 2001, 'A post with no title that is long enough to be cut somewhere after eighty characters, surely');
  perform pg_temp.say('87000000-0000-0000-0000-000000000301', p4, b);
  select * into r from pg_temp.open_reply(p4, a);
  if r.title <> 'A post with no title that is long enough to be cut somewhere after eighty chara…' then
    raise exception '§11 excerpt label "%"', r.title;
  end if;
  n_id := r.nid;
  update community_comments set is_hidden = true where id = '87000000-0000-0000-0000-000000000301';
  if pg_temp.live(p4, a) <> 0 then raise exception '§11 hiding the only reply did not dismiss'; end if;
  if (select push_sent from user_notifications where notification_id = n_id) is not true then
    raise exception '§11 queued push not cancelled';
  end if;
  -- Dismissed is not enough: the recipient and the school's teachers can still
  -- select the row. Nothing of the removed reply or its author may be left.
  select * into r from notifications where id = n_id;
  if r.content <> 'A post with no title that is long enough to be cut somewhere after eighty chara…'
     or r.content like '%reply 301%' or r.content like '%Test Student%'
     or r.metadata ?| array['comment_id', 'actor_id', 'actor_name', 'actor_role', 'snippet', 'reply_to'] then
    raise exception '§11 hidden only reply not scrubbed: "%" %', r.content, r.metadata;
  end if;

  perform pg_temp.say('87000000-0000-0000-0000-000000000302', p4, b);
  perform pg_temp.say('87000000-0000-0000-0000-000000000303', p4, b);
  perform pg_temp.say('87000000-0000-0000-0000-000000000304', p4, b);
  update community_comments set is_hidden = true where id = '87000000-0000-0000-0000-000000000304';
  select * into r from pg_temp.open_reply(p4, a);
  if (r.metadata ->> 'count')::int <> 2 or r.title not like '(2) A post with no title%' then
    raise exception '§11 not decremented: %', r.metadata;
  end if;
  if r.metadata ?| array['comment_id', 'actor_id', 'actor_name', 'snippet', 'reply_to'] or r.content like '%reply 304%' then
    raise exception '§11 hidden reply not scrubbed: % / %', r.metadata, r.content;
  end if;

  perform pg_temp.say('87000000-0000-0000-0000-000000000305', p4, b);
  if (select (metadata ->> 'count')::int from pg_temp.open_reply(p4, a)) <> 3 then raise exception '§11 setup'; end if;
  delete from community_comments where id = '87000000-0000-0000-0000-000000000305';
  select * into r from pg_temp.open_reply(p4, a);
  if (r.metadata ->> 'count')::int <> 2 or r.metadata ? 'comment_id' then raise exception '§11 hard delete: %', r.metadata; end if;

  update community_posts set is_hidden = true where id = p4;
  if pg_temp.live(p4, a) <> 0 then raise exception '§11 hiding the post did not retract'; end if;
  if exists (select 1 from notifications where community_post_id = p4) then
    raise exception '§11 notifications about a hidden post survived (title and snippets stay readable)';
  end if;

  -- the only reply hard-deleted (account deletion cascades comments, #850):
  -- dismissed, and neither the words nor the name survive
  insert into community_posts (id, tenant_id, author_id, course_id, title, content)
  values (p9, ca, a, 2001, 'Deleted member', 'x');
  perform pg_temp.say('87000000-0000-0000-0000-000000000351', p9, b);
  select * into r from pg_temp.open_reply(p9, a);
  n_id := r.nid;
  delete from community_comments where id = '87000000-0000-0000-0000-000000000351';
  if pg_temp.live(p9, a) <> 0 then raise exception '§11 deleting the only reply did not dismiss'; end if;
  select * into r from notifications where id = n_id;
  if r.content <> 'Deleted member' or r.metadata ?| array['comment_id', 'actor_id', 'actor_name', 'snippet'] then
    raise exception '§11 deleted only reply not scrubbed: "%" %', r.content, r.metadata;
  end if;

  -- §12 forged rows: no client writes a community notification; a planted one is never adopted
  perform set_config('request.jwt.claims', json_build_object(
    'sub', t, 'role', 'authenticated', 'tenant_id', ca, 'tenant_role', 'admin')::text, true);
  foreach f in array array['community', 'post-link'] loop
    begin
      set local role authenticated;
      if f = 'community' then
        insert into notifications (tenant_id, title, content, notification_type, status)
        values (ca, 'forged', 'forged', 'community', 'sent');
      else
        insert into notifications (tenant_id, title, content, notification_type, status, community_post_id)
        values (ca, 'forged', 'forged', 'info', 'sent', p1);
      end if;
      raise exception 'forged-accepted';
    exception when others then
      if sqlerrm = 'forged-accepted' or sqlstate not in ('42501', '23514') then
        raise exception '§12 staff insert (%) not refused: % (%)', f, sqlerrm, sqlstate;
      end if;
    end;
  end loop;
  set local role authenticated;
  update notifications set title = 'rewritten' where id = n_first;
  get diagnostics v = row_count;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v <> 0 or (select title from notifications where id = n_first) = 'rewritten' then
    raise exception '§12 staff rewrote a community notification';
  end if;

  insert into community_posts (id, tenant_id, author_id, course_id, title, content) values (p5, ca, a, 2001, 'Planted', 'x');
  insert into notifications (tenant_id, title, content, notification_type, status, community_post_id, target_type, metadata)
  values (def, 'planted', 'planted', 'community', 'sent', p5, 'user', '{"kind":"community_reply","count":7}')
  returning id into n_planted;
  insert into user_notifications (notification_id, user_id) values (n_planted, a);
  perform pg_temp.say('87000000-0000-0000-0000-000000000501', p5, b);
  if (select (metadata ->> 'count')::int from notifications where id = n_planted) <> 7 then
    raise exception '§12 planted row adopted';
  end if;
  if not exists (
    select 1 from notifications n join user_notifications un on un.notification_id = n.id and un.user_id = a
     where n.community_post_id = p5 and n.tenant_id = ca and (n.metadata ->> 'count')::int = 1
  ) then
    raise exception '§12 no notification in the post''s own tenant';
  end if;

  -- §13 prompts: one shared row; enrolled students with access, and nobody else
  insert into community_posts (id, tenant_id, author_id, course_id, post_type, title, content)
  values ('87000000-0000-0000-0000-000000000601', ca, t, 2001, 'discussion_prompt', 'Week 1', 'Introduce yourself');
  audience := pg_temp.prompt_audience('87000000-0000-0000-0000-000000000601');
  if audience <> (select array_agg(u order by u) from unnest(array[a, b]) u) then
    raise exception '§13 audience %', audience;
  end if;
  select * into r from notifications where community_post_id = '87000000-0000-0000-0000-000000000601';
  if r.target_type <> 'course' or r.target_course_id <> 2001 or r.created_by is not null
     or r.title <> 'Python for Beginners' or r.content <> 'Week 1' or r.metadata ->> 'course_title' <> 'Python for Beginners' then
    raise exception '§13 row % % % "%" "%"', r.target_type, r.target_course_id, r.created_by, r.title, r.content;
  end if;
  if (select count(*) from notifications where community_post_id = '87000000-0000-0000-0000-000000000601') <> 1 then
    raise exception '§13 not one shared row';
  end if;

  -- enrolled without access (C), suspended member (B)
  insert into enrollments (user_id, course_id, status, tenant_id) values (c, 2001, 'active', ca);
  update tenant_users set status = 'suspended' where tenant_id = ca and user_id = b;
  insert into community_posts (id, tenant_id, author_id, course_id, post_type, content)
  values ('87000000-0000-0000-0000-000000000602', ca, t, 2001, 'discussion_prompt', 'Prompt two');
  if pg_temp.prompt_audience('87000000-0000-0000-0000-000000000602') <> array[a] then
    raise exception '§13 no-access / inactive: %', pg_temp.prompt_audience('87000000-0000-0000-0000-000000000602');
  end if;
  -- prompt pushes: the first queues one; a second prompt while it is still
  -- queued lands in-app only
  if exists (select 1 from notifications n join user_notifications un on un.notification_id = n.id
              where n.community_post_id = '87000000-0000-0000-0000-000000000601' and un.push_sent) then
    raise exception '§13 first prompt push not queued';
  end if;
  if (select un.push_sent from notifications n join user_notifications un on un.notification_id = n.id and un.user_id = a
       where n.community_post_id = '87000000-0000-0000-0000-000000000602') is not true then
    raise exception '§13 second prompt pushed again inside the window';
  end if;
  update tenant_users set status = 'active' where tenant_id = ca and user_id = b;

  -- prompts off, and a block either way
  insert into notification_preferences (user_id, community_prompts) values (a, false);
  insert into community_posts (id, tenant_id, author_id, course_id, post_type, content)
  values ('87000000-0000-0000-0000-000000000603', ca, t, 2001, 'discussion_prompt', 'Prompt three');
  if pg_temp.prompt_audience('87000000-0000-0000-0000-000000000603') <> array[b] then raise exception '§13 prompts off'; end if;
  delete from notification_preferences where user_id = a;
  insert into community_user_blocks (blocker_id, blocked_id) values (b, t), (t, a);
  insert into community_posts (id, tenant_id, author_id, course_id, post_type, content)
  values ('87000000-0000-0000-0000-000000000604', ca, t, 2001, 'discussion_prompt', 'Prompt four');
  if pg_temp.prompt_audience('87000000-0000-0000-0000-000000000604') <> '{}' then raise exception '§13 across a block'; end if;
  if exists (select 1 from notifications where community_post_id = '87000000-0000-0000-0000-000000000604') then
    raise exception '§13 zero recipients left a row';
  end if;
  delete from community_user_blocks where blocker_id in (b, t);

  -- once the window has passed, a prompt pushes again; still inside it, it does not
  perform count(*) from claim_pending_pushes(1000, interval '1 day');
  update user_notifications un set push_sent_at = now() - interval '16 minutes'
    from notifications n
   where n.id = un.notification_id and un.user_id = a and n.metadata ->> 'kind' = 'community_prompt';
  insert into community_posts (id, tenant_id, author_id, course_id, post_type, content)
  values ('87000000-0000-0000-0000-000000000608', ca, t, 2001, 'discussion_prompt', 'Prompt eight');
  if (select un.push_sent from notifications n join user_notifications un on un.notification_id = n.id and un.user_id = a
       where n.community_post_id = '87000000-0000-0000-0000-000000000608') is not false then
    raise exception '§13 prompt push not re-armed after the window';
  end if;
  if (select un.push_sent from notifications n join user_notifications un on un.notification_id = n.id and un.user_id = b
       where n.community_post_id = '87000000-0000-0000-0000-000000000608') is not true then
    raise exception '§13 prompt pushed inside the window';
  end if;

  -- school-feed prompts and courses nobody is enrolled in notify nobody, leave no row
  insert into community_posts (id, tenant_id, author_id, post_type, content)
  values ('87000000-0000-0000-0000-000000000605', ca, t, 'discussion_prompt', 'School prompt');
  insert into community_posts (id, tenant_id, author_id, course_id, post_type, content)
  values ('87000000-0000-0000-0000-000000000606', ca, t, 2002, 'discussion_prompt', 'Empty course');
  if exists (select 1 from notifications where community_post_id in
             ('87000000-0000-0000-0000-000000000605', '87000000-0000-0000-0000-000000000606')) then
    raise exception '§13 school prompt / empty course notified';
  end if;

  -- §14 a failing notification never fails the comment or the prompt
  alter table notifications add constraint n870_always_fails check (false) not valid;
  perform pg_temp.say('87000000-0000-0000-0000-000000000701', p5, b);
  insert into community_posts (id, tenant_id, author_id, course_id, post_type, content)
  values ('87000000-0000-0000-0000-000000000607', ca, t, 2001, 'discussion_prompt', 'Survives');
  alter table notifications drop constraint n870_always_fails;
  if not exists (select 1 from community_comments where id = '87000000-0000-0000-0000-000000000701')
     or not exists (select 1 from community_posts where id = '87000000-0000-0000-0000-000000000607') then
    raise exception '§14 host insert failed with the notification';
  end if;

  -- §15 privileges: nothing new is callable by a client; definers pin search_path = ''
  for r in
    select p.oid, p.proname, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proname in ('community_notification_excerpt', 'community_notify_blocked', 'community_notify_can_reach',
                         'community_notify_wants', 'community_reply_recipients', 'community_prompt_recipients',
                         'community_upsert_reply_notification', 'community_notify_answer_accepted',
                         'community_notify_on_comment', 'community_notify_on_prompt',
                         'community_retract_post_notifications', 'community_retract_comment_notifications',
                         'community_retract_on_block')
  loop
    if has_function_privilege('anon', r.oid, 'execute') or has_function_privilege('authenticated', r.oid, 'execute') then
      raise exception '§15 % is callable by a client', r.proname;
    end if;
    if not (r.proconfig @> array['search_path=""']) then
      raise exception '§15 % search_path %', r.proname, r.proconfig;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname like 'community\_%' and p.proname in (
         'community_notify_blocked', 'community_notify_can_reach', 'community_notify_wants',
         'community_reply_recipients', 'community_prompt_recipients', 'community_upsert_reply_notification',
         'community_notify_answer_accepted') and not p.prosecdef) > 0 then
    raise exception '§15 a helper is not security definer';
  end if;

  -- §16 RLS: a notification is read by its recipient only; a recipient cannot re-point their row
  perform set_config('request.jwt.claims', json_build_object(
    'sub', b, 'role', 'authenticated', 'tenant_id', ca, 'tenant_role', 'student')::text, true);
  set local role authenticated;
  select count(*) into v from notifications where id = n_first;
  reset role;
  if v <> 0 then raise exception '§16 B reads A''s notification'; end if;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', a, 'role', 'authenticated', 'tenant_id', ca, 'tenant_role', 'student')::text, true);
  set local role authenticated;
  select count(*) into v from notifications where id = n_first;
  reset role;
  if v <> 1 then raise exception '§16 A cannot read their own notification'; end if;
  begin
    set local role authenticated;
    update user_notifications set notification_id = n_planted where user_id = a and notification_id = n_first;
    raise exception 're-point-accepted';
  exception when others then
    if sqlstate <> '42501' then raise exception '§16 re-pointing a delivery row: % (%)', sqlerrm, sqlstate; end if;
  end;
  set local role authenticated;
  update user_notifications set in_app_read = true, in_app_read_at = now() where user_id = a and notification_id = n_first;
  get diagnostics v = row_count;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v <> 1 then raise exception '§16 A cannot mark their own notification read'; end if;

  -- §17 hard-deleting a post removes its notifications
  delete from community_posts where id = p1;
  if exists (select 1 from notifications where community_post_id = p1) then raise exception '§17 rows survived the post'; end if;

  -- §18 the #875 hook: one notification, idempotent, never to yourself or across a block
  insert into community_posts (id, tenant_id, author_id, course_id, title, content) values (p6, ca, a, 2001, 'Question', 'How?');
  perform pg_temp.say('87000000-0000-0000-0000-000000000801', p6, b);
  n_id := community_notify_answer_accepted('87000000-0000-0000-0000-000000000801', a);
  if n_id is null then raise exception '§18 no notification'; end if;
  if community_notify_answer_accepted('87000000-0000-0000-0000-000000000801', a) <> n_id then raise exception '§18 not idempotent'; end if;
  if (select metadata ->> 'kind' from notifications where id = n_id) <> 'community_answer_accepted'
     or not exists (select 1 from user_notifications where notification_id = n_id and user_id = b) then
    raise exception '§18 wrong row';
  end if;
  if community_notify_answer_accepted('87000000-0000-0000-0000-000000000801', b) is not null then raise exception '§18 self'; end if;
  -- hiding an accepted answer scrubs its text out of the notification too
  update community_comments set is_hidden = true where id = '87000000-0000-0000-0000-000000000801';
  select * into r from notifications where id = n_id;
  if r.content <> 'Question' or r.metadata ?| array['comment_id', 'actor_id', 'actor_name', 'snippet'] then
    raise exception '§18 hidden accepted answer not scrubbed: "%" %', r.content, r.metadata;
  end if;
  if exists (select 1 from user_notifications where notification_id = n_id and dismissed is not true) then
    raise exception '§18 hidden accepted answer not dismissed';
  end if;
  perform pg_temp.say('87000000-0000-0000-0000-000000000802', p6, b);
  insert into community_user_blocks (blocker_id, blocked_id) values (b, a);
  if community_notify_answer_accepted('87000000-0000-0000-0000-000000000802', a) is not null then raise exception '§18 across a block'; end if;
  -- accepted by staff, but B blocked the post's author: the post is hidden from B
  if community_notify_answer_accepted('87000000-0000-0000-0000-000000000802', t) is not null then
    raise exception '§18 notified about a blocked author''s post';
  end if;
  delete from community_user_blocks where blocker_id = b;
  if community_notify_answer_accepted('87000000-0000-0000-0000-000000000802', t) is null then raise exception '§18 staff accept'; end if;

  -- §19 digest candidates count unread replies with activity inside the last day
  -- (A has live reply rows on P5–P8 by now; P5's planted row is another tenant's and does not count)
  select coalesce(sum((n.metadata ->> 'count')::int), 0) into v
    from notifications n join user_notifications un on un.notification_id = n.id
   where un.user_id = a and un.in_app_read = false and un.dismissed is not true and n.tenant_id = ca
     and n.metadata ->> 'kind' in ('community_reply', 'community_answer_accepted');
  if v < 1 then raise exception '§19 setup: A has no unread replies'; end if;
  if (select community_replies from get_daily_digest_candidates(null, null, 1000) where user_id = a and tenant_id = ca) <> v then
    raise exception '§19 candidate count % expected %',
      (select community_replies from get_daily_digest_candidates(null, null, 1000) where user_id = a and tenant_id = ca), v;
  end if;
  update user_notifications un set created_at = now() - interval '2 days'
    from notifications n
   where n.id = un.notification_id and un.user_id = a and n.notification_type = 'community';
  if coalesce((select community_replies from get_daily_digest_candidates(null, null, 1000) where user_id = a and tenant_id = ca), 0) <> 0 then
    raise exception '§19 replies older than a day counted';
  end if;

  raise notice 'issue-870 community notifications: all checks passed';
end $$;

rollback;
