-- Create the auth hook function
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
  declare
    claims jsonb;
    user_role public.app_role;
  begin
    -- Fetch the user role in the user_roles table
    select role into user_role from public.user_roles where user_id = (event->>'user_id')::uuid;

    claims := event->'claims';

    if user_role is not null then
      -- Set the claim
      claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    else
      claims := jsonb_set(claims, '{user_role}', 'null');
    end if;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified or original event
    return event;
  end;
$$;

grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.custom_access_token_hook
  to supabase_auth_admin;

revoke execute
  on function public.custom_access_token_hook
  from authenticated, anon, public;

grant all
  on table public.user_roles
to supabase_auth_admin;

revoke all
  on table public.user_roles
  from authenticated, anon, public;

create policy "Allow auth admin to read user roles" ON public.user_roles
as permissive for select
to supabase_auth_admin
using (true);


CREATE OR REPLACE FUNCTION public.get_exam_submissions(
    p_exam_id integer
)
RETURNS TABLE (
    submission_id integer,
    exam_id integer,
    exam_title character varying(100),
    student_id uuid,
    submission_date timestamp with time zone,
    score numeric(5, 2),
    feedback text,
    evaluated_at timestamp with time zone,
    is_reviewed boolean,
    full_name text
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        es.submission_id,
        es.exam_id,
        e.title AS exam_title,
        es.student_id,
        es.submission_date,
        s.score,
        s.feedback,
        s.evaluated_at,
        (s.score IS NOT NULL) AS is_reviewed,
        a.full_name
    FROM 
        public.exam_submissions es
    JOIN 
        public.exams e ON es.exam_id = e.exam_id
    JOIN 
        public.profiles a ON es.student_id = a.id
    LEFT JOIN 
        public.exam_scores s ON es.submission_id = s.submission_id
    WHERE 
        es.exam_id = p_exam_id
    ORDER BY 
        es.submission_date DESC;
END;
$$;


-- Fix typo in the success status from 'successfull' to 'successful'
CREATE OR REPLACE FUNCTION enroll_user(
    _user_id UUID,
    _product_id INTEGER
) RETURNS VOID AS $$
DECLARE
    _course_id INTEGER;
    _product_based_enrollment BOOLEAN;
BEGIN
    -- Check if the product is mapped to a course in the product_courses table
    SELECT course_id INTO _course_id
    FROM product_courses
    WHERE product_id = _product_id;

    -- If found, proceed with course enrollment
    IF FOUND THEN
        -- Check if user has a valid product purchase for the course
        SELECT EXISTS (
            SELECT 1
            FROM transactions t
            WHERE t.user_id = _user_id AND t.product_id = _product_id AND t.status = 'successful'
        ) INTO _product_based_enrollment;

        -- If a valid product purchase is found, enroll the user in the course
        IF _product_based_enrollment THEN
            INSERT INTO enrollments (user_id, course_id, product_id, enrollment_date)
            VALUES (_user_id, _course_id, _product_id, NOW())
            ON CONFLICT (user_id, course_id) DO NOTHING;
        ELSE
            RAISE NOTICE 'No valid product purchase found for this user.';
        END IF;
    ELSE
        RAISE NOTICE 'Product is not associated with any course.';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Fix typo in the success status from 'successfull' to 'successful'
CREATE OR REPLACE FUNCTION handle_new_subscription(
    _user_id UUID,
    _plan_id INTEGER,
    _transaction_id INTEGER,
    _start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) RETURNS VOID AS $$
DECLARE
    _duration INTERVAL;
    _end_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get the duration of the plan
    SELECT make_interval(days => duration_in_days) INTO _duration
    FROM plans
    WHERE plan_id = _plan_id;

    -- Calculate the end date
    _end_date := _start_date + _duration;

    -- Insert a new subscription
    INSERT INTO subscriptions (user_id, plan_id, start_date, end_date, transaction_id, subscription_status)
    VALUES (_user_id, _plan_id, _start_date, _end_date, _transaction_id, 'active')
    ON CONFLICT (user_id, plan_id) DO NOTHING; -- Prevent duplicate subscriptions for the same plan
END;
$$ LANGUAGE plpgsql;

-- Fix typo in the status update column from 'status' to 'subscription_status'
CREATE OR REPLACE FUNCTION cancel_subscription(
    _user_id UUID,
    _plan_id INTEGER
) RETURNS VOID AS $$
BEGIN
    -- Mark the subscription as canceled
    UPDATE subscriptions
    SET subscription_status = 'canceled'
    WHERE user_id = _user_id AND plan_id = _plan_id AND subscription_status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Updated consolidated trigger function to handle user enrollments and subscriptions for both inserts and updates
CREATE OR REPLACE FUNCTION trigger_manage_transactions() RETURNS trigger AS $$
DECLARE
  _course_id INTEGER;
  _duration INTERVAL;
  _end_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Handle product-based course enrollments
  IF NEW.product_id IS NOT NULL THEN
    -- Check if the product is mapped to a course
    SELECT course_id INTO _course_id
    FROM product_courses
    WHERE product_id = NEW.product_id;
    IF FOUND AND NEW.status = 'successful' THEN
      -- Call the enrollment function if a valid purchase is found
      PERFORM enroll_user(NEW.user_id, NEW.product_id);
    END IF;
  END IF;
  
  -- Handle new subscriptions or renewals
  IF NEW.plan_id IS NOT NULL THEN
    IF NEW.status = 'successful' THEN
      -- Check if there's an existing active subscription
      SELECT end_date INTO _end_date
      FROM subscriptions
      WHERE user_id = NEW.user_id AND plan_id = NEW.plan_id AND subscription_status IN ('active', 'renewed');
      IF _end_date IS NOT NULL THEN
        -- Get the duration of the plan
        SELECT make_interval(days => duration_in_days) INTO _duration
        FROM plans
        WHERE plan_id = NEW.plan_id;
        -- Calculate the new end date
        _end_date := _end_date + _duration;
        -- Update the existing subscription
        UPDATE subscriptions
        SET end_date = _end_date, subscription_status = 'renewed', transaction_id = NEW.transaction_id
        WHERE user_id = NEW.user_id AND plan_id = NEW.plan_id;
      ELSE
        -- Insert a new subscription
        PERFORM handle_new_subscription(NEW.user_id, NEW.plan_id, NEW.transaction_id);
      END IF;
    ELSEIF NEW.status = 'failed' THEN
      -- Mark the subscription as canceled
      PERFORM cancel_subscription(NEW.user_id, NEW.plan_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the insert trigger is still present and up to date
DROP TRIGGER IF EXISTS after_transaction_insert ON transactions;

CREATE TRIGGER after_transaction_insert
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION trigger_manage_transactions();

-- Create the trigger to handle updates on the transactions table
DROP TRIGGER IF EXISTS after_transaction_update ON transactions;

CREATE TRIGGER after_transaction_update
AFTER UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION trigger_manage_transactions();



CREATE OR REPLACE FUNCTION save_exam_feedback(

  p_submission_id INTEGER,

  p_exam_id INTEGER,

  p_student_id UUID,

  p_answers JSONB,

  p_overall_feedback TEXT,

  p_score NUMERIC

) RETURNS VOID AS $$

DECLARE

  answer RECORD;

  answer_data JSONB;

BEGIN

  -- Update or insert the exam answers

  FOR answer_data IN SELECT * FROM jsonb_array_elements(p_answers) LOOP

    UPDATE public.exam_answers

    SET

      feedback = COALESCE(answer_data->>'feedback', feedback),

      is_correct = COALESCE((answer_data->>'is_correct')::BOOLEAN, is_correct)

    WHERE answer_id = (answer_data->>'answer_id')::INTEGER;



    UPDATE public.exam_answers

    SET

      feedback = COALESCE(answer_data->>'feedback', feedback),

      is_correct = COALESCE((answer_data->>'is_correct')::BOOLEAN, is_correct)

    WHERE answer_id = (answer_data->>'answer_id')::INTEGER;

  END LOOP;



  -- Insert or update the exam score

  INSERT INTO public.exam_scores (submission_id, student_id, exam_id, score, feedback)

  VALUES (p_submission_id, p_student_id, p_exam_id, p_score, p_overall_feedback)

  ON CONFLICT (submission_id, student_id, exam_id)

  DO UPDATE SET

    score = EXCLUDED.score,

    feedback = EXCLUDED.feedback,

    evaluated_at = CURRENT_TIMESTAMP;



END;

$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION identify_subscriptions_due_for_renewal(
  renewal_period INTERVAL
) RETURNS TABLE (
  user_id UUID,
  subscription_id INTEGER,
  plan_id INTEGER,
  end_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT subscriptions.user_id, subscriptions.subscription_id, subscriptions.plan_id, subscriptions.end_date
  FROM subscriptions
  WHERE subscriptions.end_date <= NOW() + renewal_period
    AND subscriptions.subscription_status = 'active';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_transaction_for_renewal(
  sub_id INTEGER,
  usr_id UUID,
  pln_id INTEGER
) RETURNS INTEGER AS $$
DECLARE
  new_transaction_id INTEGER;
  amount NUMERIC;
BEGIN
  -- Get the amount for the plan
  SELECT price INTO amount FROM plans WHERE plan_id = pln_id;
  
  INSERT INTO transactions (user_id, plan_id, amount, status)
  VALUES (usr_id, pln_id, amount, 'pending')
  RETURNING transaction_id INTO new_transaction_id;

  RETURN new_transaction_id; -- Return transaction ID for further processing
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_notification(
    _user_id UUID,
    _notification_type VARCHAR(50),
    _message TEXT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO notifications (user_id, notification_type, message)
    VALUES (_user_id, _notification_type, _message);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_users_for_renewal() RETURNS VOID AS $$
DECLARE
    sub_due RECORD;
BEGIN
    FOR sub_due IN
        SELECT * FROM identify_subscriptions_due_for_renewal(INTERVAL '15 days')
    LOOP
        PERFORM create_notification(
            sub_due.user_id, 
            'subscription_renewal', 
            'Your subscription is nearing expiry. Click to renew.'
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION create_exam_submission(
    p_student_id UUID,
    p_exam_id INTEGER,
    p_answers JSONB
)
RETURNS INTEGER AS $$
DECLARE
    v_submission_id INTEGER;
    answer JSONB;
    v_question_id INTEGER;
    v_question_type VARCHAR;
    v_answer_text TEXT;
    v_is_correct BOOLEAN;
    v_actual_correct BOOLEAN;
BEGIN
    -- Insert a new submission into the exam_submissions table and get the submission_id
    INSERT INTO public.exam_submissions (exam_id, student_id, submission_date)
    VALUES (p_exam_id, p_student_id, current_timestamp)
    RETURNING submission_id INTO v_submission_id;

    -- Loop through each answer in the p_answers array
    FOR answer IN SELECT jsonb_array_elements(p_answers) LOOP
        -- Assign JSON values to variables
        v_question_id := (answer->>'question_id')::INTEGER;
        v_question_type := answer->>'question_type';
        v_answer_text := answer->>'answer_text';

        -- Convert v_answer_text to BOOLEAN if v_question_type is 'true_false'
        IF v_question_type = 'true_false' THEN
            v_is_correct := (v_answer_text = 'True');
            -- Retrieve the correct answer from question_options
            SELECT is_correct INTO v_actual_correct
            FROM public.question_options
            WHERE question_id = v_question_id;
        ELSE
            v_actual_correct := NULL;
        END IF;

        -- Check if there is already an answer for this question for this submission
        IF EXISTS (
            SELECT 1
            FROM public.exam_answers
            WHERE submission_id = v_submission_id AND question_id = v_question_id
        ) THEN
            IF v_question_type != 'multiple_choice' THEN
                RAISE NOTICE 'Skipping duplicate answer for question_id: %', v_question_id;
            ELSE
                -- Allow multiple answers for multiple-choice questions
                INSERT INTO public.exam_answers (
                    submission_id, question_id, answer_text, is_correct
                ) VALUES (
                    v_submission_id,
                    v_question_id,
                    v_answer_text,
                    v_is_correct = v_actual_correct
                );
            END IF;
        ELSE
            -- Insert the answer as it doesn’t exist
            INSERT INTO public.exam_answers (
                submission_id, question_id, answer_text, is_correct
            ) VALUES (
                v_submission_id,
                v_question_id,
                v_answer_text,
                v_is_correct = v_actual_correct
            );
        END IF;
    END LOOP;

    -- Return the submission ID
    RETURN v_submission_id;
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tickets_updated_at
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    -- Insert row into profiles
    INSERT INTO public.profiles (id, username, avatar_url, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'full_name');

    -- Insert default role 'student'
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student');

    -- Optional logging
    RAISE NOTICE 'New user profile created with ID: %', NEW.id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

SELECT cron.schedule(
  'notify_users_for_renewal',
  '0 0 * * *', -- Every day at midnight
  'SELECT notify_users_for_renewal();'
);
