-- Issue #658 — DB-level plan limits. Runs entirely inside a transaction that is
-- rolled back, so it leaves the seeded database untouched.
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off \
--     < tests/sql/issue-658-plan-limit-triggers.sql
--
-- Uses Default School (free: max_courses 5 / max_students 50) and Code Academy
-- (enterprise: unlimited). Each assertion RAISEs on failure and the script ends
-- with a `PASS:` notice.
begin;

do $$
declare
  free_tenant  constant uuid := '00000000-0000-0000-0000-000000000001';
  ent_tenant   constant uuid := '00000000-0000-0000-0000-000000000002';
  author       uuid;
  base_courses int;
  max_courses  int;
  archived_id  int;
  base_students int;
  max_students int;
  seat_user    uuid;
  staff_user   uuid;
  got_state    text;
  got_msg      text;
begin
  -- ── fixtures ──────────────────────────────────────────────────────────────
  select user_id into author from tenant_users
   where tenant_id = free_tenant and role in ('admin','teacher') and status = 'active' limit 1;
  if author is null then raise exception 'fixture: no staff member in Default School'; end if;

  max_courses := tenant_plan_limit(free_tenant, 'max_courses');
  if max_courses <> 5 then raise exception 'fixture: expected free max_courses 5, got %', max_courses; end if;
  if tenant_plan_limit(ent_tenant, 'max_courses') <> -1 then raise exception 'fixture: enterprise should be unlimited'; end if;

  -- ── 1. fill Default School to its course limit, legitimately ─────────────
  base_courses := count_plan_limit_usage(free_tenant, 'courses');
  for i in 1 .. (max_courses - base_courses) loop
    insert into courses (title, author_id, tenant_id, status)
    values (format('658 filler %s', i), author, free_tenant, 'draft');
  end loop;
  if count_plan_limit_usage(free_tenant, 'courses') <> max_courses then
    raise exception '§1 could not fill the tenant to its limit';
  end if;

  -- ── 2. the (max+1)th course is refused with LM001 ─────────────────────────
  begin
    insert into courses (title, author_id, tenant_id, status)
    values ('658 one too many', author, free_tenant, 'draft');
    raise exception '§2 insert past the limit was allowed';
  exception when sqlstate 'LM001' then
    get stacked diagnostics got_msg = message_text;
    if got_msg <> 'plan_limit_exceeded:courses' then
      raise exception '§2 wrong message: %', got_msg;
    end if;
  end;

  -- ── 3. an archived course never consumes a slot ───────────────────────────
  insert into courses (title, author_id, tenant_id, status)
  values ('658 born archived', author, free_tenant, 'archived')
  returning course_id into archived_id;

  -- ── 4. un-archiving at the limit is refused (the restore / MCP path) ─────
  begin
    update courses set status = 'published' where course_id = archived_id;
    raise exception '§4 un-archive past the limit was allowed';
  exception when sqlstate 'LM001' then null;
  end;

  -- ── 5. editing an already-counted course is never blocked ────────────────
  update courses set status = 'published', title = title || ' (edited)'
   where tenant_id = free_tenant and title = '658 filler 1';

  -- ── 6. archive one, then the un-archive goes through ─────────────────────
  update courses set status = 'archived' where tenant_id = free_tenant and title like '658 filler 2%';
  update courses set status = 'published' where course_id = archived_id;
  if count_plan_limit_usage(free_tenant, 'courses') <> max_courses then
    raise exception '§6 count drifted: %', count_plan_limit_usage(free_tenant, 'courses');
  end if;

  -- ── 7. the bypass GUC lets operators through ──────────────────────────────
  perform set_config('app.bypass_plan_limits', 'on', true);
  insert into courses (title, author_id, tenant_id, status)
  values ('658 ops bypass', author, free_tenant, 'draft');
  perform set_config('app.bypass_plan_limits', '', true);
  begin
    insert into courses (title, author_id, tenant_id, status)
    values ('658 bypass is off again', author, free_tenant, 'draft');
    raise exception '§7 bypass leaked past set_config reset';
  exception when sqlstate 'LM001' then null;
  end;

  -- ── 8. unlimited plan: never refused ──────────────────────────────────────
  select user_id into author from tenant_users
   where tenant_id = ent_tenant and role in ('admin','teacher') and status = 'active' limit 1;
  for i in 1 .. 8 loop
    insert into courses (title, author_id, tenant_id, status)
    values (format('658 enterprise %s', i), author, ent_tenant, 'published');
  end loop;

  -- ── 9. student seats: fill to max_students, the next join is refused ─────
  max_students := tenant_plan_limit(free_tenant, 'max_students');
  if max_students <> 50 then raise exception 'fixture: expected free max_students 50, got %', max_students; end if;
  base_students := count_plan_limit_usage(free_tenant, 'students');

  -- Inserting into auth.users fires handle_new_user(); its profile row is
  -- rolled back with everything else.
  for i in 1 .. (max_students - base_students) loop
    seat_user := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (seat_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            format('seat-658-%s@example.test', i), '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
    insert into tenant_users (tenant_id, user_id, role, status) values (free_tenant, seat_user, 'student', 'active');
  end loop;
  if count_plan_limit_usage(free_tenant, 'students') <> max_students then
    raise exception '§9 could not fill student seats';
  end if;

  seat_user := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (seat_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'seat-658-overflow@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
  begin
    insert into tenant_users (tenant_id, user_id, role, status) values (free_tenant, seat_user, 'student', 'active');
    raise exception '§9 student past the limit was allowed';
  exception when sqlstate 'LM001' then
    get stacked diagnostics got_msg = message_text;
    if got_msg <> 'plan_limit_exceeded:students' then raise exception '§9 wrong message: %', got_msg; end if;
  end;

  -- ── 10. staff never consume a seat; demoting staff to student at cap does ─
  insert into tenant_users (tenant_id, user_id, role, status) values (free_tenant, seat_user, 'teacher', 'active');
  begin
    update tenant_users set role = 'student' where tenant_id = free_tenant and user_id = seat_user;
    raise exception '§10 role change into a full seat pool was allowed';
  exception when sqlstate 'LM001' then null;
  end;

  -- ── 11. removed students free a seat; reinstating at cap is refused ──────
  select user_id into staff_user from tenant_users
   where tenant_id = free_tenant and role = 'student' and status = 'active' limit 1;
  update tenant_users set status = 'removed' where tenant_id = free_tenant and user_id = staff_user;
  -- seat freed → the teacher can now become a student
  update tenant_users set role = 'student' where tenant_id = free_tenant and user_id = seat_user;
  -- pool is full again → reinstating the removed student is refused
  begin
    update tenant_users set status = 'active' where tenant_id = free_tenant and user_id = staff_user;
    raise exception '§11 reinstatement past the limit was allowed';
  exception when sqlstate 'LM001' then null;
  end;

  -- ── 12. get_tenant_plan_usage reports the same numbers ───────────────────
  if (get_tenant_plan_usage(free_tenant) ->> 'courses')::int <> count_plan_limit_usage(free_tenant, 'courses')
     or (get_tenant_plan_usage(free_tenant) ->> 'max_students')::int <> 50
     or (get_tenant_plan_usage(ent_tenant) ->> 'max_courses')::int <> -1 then
    raise exception '§12 get_tenant_plan_usage disagrees with the counters: %', get_tenant_plan_usage(free_tenant);
  end if;

  raise notice 'PASS: issue #658 plan-limit triggers (courses + student seats)';
end;
$$;

rollback;
