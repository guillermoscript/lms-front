-- Supabase AI is experimental and may produce incorrect answers
-- Always verify the output before executing
CREATE OR REPLACE FUNCTION public.get_user_submited_tests(course_id_arg BIGINT, user_id_arg UUID)
RETURNS TABLE (
  submission_id BIGINT,
    user_id UUID,
    test_id BIGINT,
    question_id BIGINT,
    question_text TEXT,
    question_type TEXT,
    correct_answer TEXT,
    option_id BIGINT,
    option_text TEXT,
    is_correct BOOLEAN,
    given_answer TEXT,
    answer_is_correct BOOLEAN
) AS $$

BEGIN
    RETURN QUERY (
        select distinct
  ts.id as submission_id,
  ts.user_id::uuid,
  ts.test_id,
  tq.id as question_id,
  tq.question_text,
  tq.question_type,
  tq.correct_answer,
  qo.id as option_id,
  qo.option_text,
  qo.is_correct,
  sa.given_answer,
  sa.is_correct as answer_is_correct
from
  public.test_submissions ts
  join public.tests t on ts.test_id = t.id
  join public.test_questions tq on t.id = tq.test_id
  inner join public.submission_answers sa on ts.id = sa.submission_id
  and tq.id = sa.question_id
  left join public.question_options qo on tq.id = qo.question_id
  and (
    (
      tq.question_type = 'multiple_choice'
      and CAST(sa.given_answer as int) = qo.id
    )
    or (
      tq.question_type = 'true_false'
      and sa.given_answer = qo.option_text
    )
  )
where
  t.course_id = course_id_arg
  and -- Replace with actual course ID
  ts.user_id::uuid = user_id_arg
  AND ts.teacher_review is null;
-- Replace with actual user ID
    )
    ;
END;
$$ LANGUAGE plpgsql;



CREATE OR REPLACE FUNCTION public.get_course_progress(course_id_arg BIGINT, user_id_arg UUID)
RETURNS TABLE(
    user_id UUID,
    course_id BIGINT,
    completed_lessons INT,
    total_lessons INT,
    progress_percentage NUMERIC,
    total_tests INT,
    tests_approved INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id AS user_id,
        c.id AS course_id,
        COALESCE(COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.progress_status = 'completed')::INT, 0) AS completed_lessons,
        COUNT(DISTINCT l.id)::INT AS total_lessons,
        COALESCE(ROUND(COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.progress_status = 'completed')::DECIMAL * 100 / NULLIF(COUNT(DISTINCT l.id), 0), 2), 0) AS progress_percentage,
        COUNT(DISTINCT t.id)::INT AS total_tests,
        COUNT(DISTINCT ts.id) FILTER (WHERE ts.is_approved) AS tests_approved
    FROM
        public.courses c
    LEFT JOIN public.lessons l ON l.course_id = c.id AND l.deleted_at IS NULL
    LEFT JOIN public.lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = user_id_arg
    LEFT JOIN public.tests t ON t.course_id = c.id
    LEFT JOIN public.test_submissions ts ON ts.test_id = t.id AND ts.user_id = user_id_arg AND ts.is_approved IS TRUE
    LEFT JOIN public.auth_users u ON u.id = user_id_arg
    WHERE
        c.id = course_id_arg AND
        (c.deleted_at IS NULL OR c.deleted_at > CURRENT_TIMESTAMP) AND
        (lp.user_id = u.id OR lp.user_id IS NULL) -- handle edge case where the user hasn't started any lessons
    GROUP BY
        u.id, c.id;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION process_purchase()
RETURNS TRIGGER AS $$
DECLARE
    _product_id BIGINT;
    _is_subscription BOOLEAN;
    _quantity NUMERIC;
BEGIN
    FOR _product_id, _is_subscription, _quantity IN
        SELECT p.id, p.is_subscription, ili.quantity
        FROM invoice_line_items ili
        JOIN products p ON p.id = ili.product_id
        WHERE ili.invoice_id = NEW.id
    LOOP
        -- Handle subscription products
        IF _is_subscription THEN
          INSERT INTO subscriptions (customer_id, plan_id, invoice_id, status, starts_at, ends_at)
          VALUES (
              NEW.customer_id, 
              _product_id, 
              NEW.id, 
              'active', 
              CURRENT_TIMESTAMP, 
              CURRENT_TIMESTAMP + ((SELECT billing_interval FROM plans WHERE product_id = _product_id LIMIT 1) || ' days')::INTERVAL
          );
        -- Handle course products
        ELSE
            FOR i IN 1.._quantity::INT LOOP
                INSERT INTO course_enrollments (course_id, user_id, enrolled_at, status)
                VALUES (_product_id, NEW.customer_id, CURRENT_TIMESTAMP, 'active');
            END LOOP;
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;