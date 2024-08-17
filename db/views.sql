create view
  public.get_reviews as
select
  reviews.id as review_id,
  reviews.rating,
  reviews.review_text,
  reviews.created_at,
  reviews.entity_id,
  reviews.entity_type,
  profiles.full_name,
  profiles.id as profile_id
from
  reviews
  join profiles on reviews.user_id = profiles.id;

  create view
  public.distinct_exam_views as
select distinct
  on (ev.user_id, ev.exam_id) ev.id as view_id,
  ev.exam_id,
  ev.user_id,
  ev.viewed_at,
  e.title as exam_title,
  e.course_id as exam_course_id,
  e.description as exam_description,
  e.exam_date,
  e.duration as exam_duration,
  e.created_at as exam_created_at,
  e.updated_at as exam_updated_at,
  e.status as exam_status,
  e.sequence as exam_sequence,
  e.created_by as exam_created_by
from
  exam_views ev
  join exams e on ev.exam_id = e.exam_id
order by
  ev.user_id,
  ev.exam_id,
  ev.viewed_at desc;

  create view
  public.distinct_lesson_views as
select distinct
  on (lv.user_id, lv.lesson_id) lv.id as view_id,
  lv.lesson_id,
  lv.user_id,
  lv.viewed_at,
  l.title as lesson_title,
  l.course_id as lesson_course_id,
  l.sequence as lesson_sequence,
  l.content as lesson_content,
  l.created_at as lesson_created_at,
  l.updated_at as lesson_updated_at,
  l.video_url as lesson_video_url,
  l.embed_code as lesson_embed_code,
  l.status as lesson_status,
  l.description as lesson_description,
  l.summary as lesson_summary,
  l.image as lesson_image
from
  lesson_views lv
  join lessons l on lv.lesson_id = l.id
order by
  lv.user_id,
  lv.lesson_id,
  lv.viewed_at desc;