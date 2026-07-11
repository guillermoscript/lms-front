-- create_student_question_notification: consented tutor → human-teacher
-- escalation (Epic #348, issue #361). Students cannot INSERT into
-- notifications/user_notifications under RLS (both write paths are
-- admin/teacher-only), so this narrow SECURITY DEFINER RPC does it for them,
-- modeled on notify_certificate_issued(): one notifications row targeted at
-- the course's teacher + the user_notifications row that makes it visible in
-- the teacher's bell/inbox.
--
-- Guards inside the function (definer bypasses RLS, so they are mandatory):
--   * caller must be authenticated,
--   * message 10-1000 chars (context optional, <= 1000),
--   * caller must be entitled to the course (has_course_access),
--   * rate limit: max 3 questions per student per course per day.

create or replace function public.create_student_question_notification(
  _course_id bigint,
  _message text,
  _context text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user            uuid := auth.uid();
  v_course          record;
  v_today_count     int;
  v_notification_id bigint;
  v_content         text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if _message is null or length(btrim(_message)) < 10 or length(_message) > 1000 then
    raise exception 'Question must be between 10 and 1000 characters';
  end if;
  if _context is not null and length(_context) > 1000 then
    raise exception 'Context must be at most 1000 characters';
  end if;

  select course_id, title, author_id, tenant_id
    into v_course
    from public.courses
   where course_id = _course_id;
  if not found then
    raise exception 'Course % not found', _course_id;
  end if;
  if v_course.author_id is null then
    raise exception 'Course % has no teacher to notify', _course_id;
  end if;

  -- has_course_access is declared (_user_id uuid, _course_id integer).
  if not public.has_course_access(v_user, _course_id::int) then
    raise exception 'Access denied: you are not enrolled in course %', _course_id;
  end if;

  select count(*)
    into v_today_count
    from public.notifications
   where created_by = v_user
     and target_course_id = _course_id
     and metadata->>'kind' = 'student_question'
     and created_at >= date_trunc('day', now());
  if v_today_count >= 3 then
    raise exception 'Rate limit reached: max 3 questions per course per day';
  end if;

  v_content := btrim(_message);
  if _context is not null and length(btrim(_context)) > 0 then
    v_content := v_content || E'\n\n— Tutor context: ' || btrim(_context);
  end if;

  insert into public.notifications (
    title,
    content,
    notification_type,
    priority,
    target_type,
    target_user_ids,
    target_course_id,
    delivery_channels,
    status,
    sent_at,
    created_by,
    tenant_id,
    metadata
  ) values (
    'Student question: ' || v_course.title,
    v_content,
    'info',
    'normal',
    'user',
    array[v_course.author_id],
    _course_id,
    array['in_app'],
    'sent',
    now(),
    v_user,
    v_course.tenant_id,
    jsonb_build_object(
      'kind', 'student_question',
      'course_id', _course_id,
      'student_id', v_user,
      'source', 'mcp-tutor'
    )
  ) returning id into v_notification_id;

  insert into public.user_notifications (notification_id, user_id)
  values (v_notification_id, v_course.author_id);

  return v_notification_id;
end;
$$;

revoke execute on function public.create_student_question_notification(bigint, text, text)
  from public, anon;
grant execute on function public.create_student_question_notification(bigint, text, text)
  to authenticated;
