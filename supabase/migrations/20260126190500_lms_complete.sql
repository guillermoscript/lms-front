

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."ai_sender_type" AS ENUM (
    'system',
    'user',
    'assistant',
    'function',
    'data',
    'tool'
);


ALTER TYPE "public"."ai_sender_type" OWNER TO "postgres";


COMMENT ON TYPE "public"."ai_sender_type" IS 'types for the ai chat';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'moderator',
    'teacher',
    'student'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."chat_types" AS ENUM (
    'free_chat',
    'q&a',
    'exam_prep',
    'course_convo'
);


ALTER TYPE "public"."chat_types" OWNER TO "postgres";


COMMENT ON TYPE "public"."chat_types" IS 'all the possible chats types in LLM chats';



CREATE TYPE "public"."currency_type" AS ENUM (
    'usd',
    'eur'
);


ALTER TYPE "public"."currency_type" OWNER TO "postgres";


CREATE TYPE "public"."difficulty_level" AS ENUM (
    'easy',
    'medium',
    'hard'
);


ALTER TYPE "public"."difficulty_level" OWNER TO "postgres";


CREATE TYPE "public"."enrollement_status" AS ENUM (
    'active',
    'disabled'
);


ALTER TYPE "public"."enrollement_status" OWNER TO "postgres";


CREATE TYPE "public"."exercise_file_type" AS ENUM (
    'code',
    'test',
    'solution',
    'config'
);


ALTER TYPE "public"."exercise_file_type" OWNER TO "postgres";


CREATE TYPE "public"."exercise_type" AS ENUM (
    'quiz',
    'coding_challenge',
    'essay',
    'multiple_choice',
    'true_false',
    'fill_in_the_blank',
    'discussion'
);


ALTER TYPE "public"."exercise_type" OWNER TO "postgres";


CREATE TYPE "public"."notification_types" AS ENUM (
    'comment_reply',
    'comment',
    'exam_review',
    'order_renewal',
    'subscription_renewal'
);


ALTER TYPE "public"."notification_types" OWNER TO "postgres";


COMMENT ON TYPE "public"."notification_types" IS 'all the possible notifications';



CREATE TYPE "public"."reactions" AS ENUM (
    'like',
    'dislike',
    'boring',
    'funny'
);


ALTER TYPE "public"."reactions" OWNER TO "postgres";


COMMENT ON TYPE "public"."reactions" IS 'all the possible reactions to something';



CREATE TYPE "public"."review_status" AS ENUM (
    'approved',
    'pending',
    'failed'
);


ALTER TYPE "public"."review_status" OWNER TO "postgres";


COMMENT ON TYPE "public"."review_status" IS 'the possible status for something that can be used for review';



CREATE TYPE "public"."reviewable" AS ENUM (
    'lessons',
    'courses',
    'exams'
);


ALTER TYPE "public"."reviewable" OWNER TO "postgres";


COMMENT ON TYPE "public"."reviewable" IS 'what type of entity can be reviewed';



CREATE TYPE "public"."status" AS ENUM (
    'published',
    'draft',
    'archived'
);


ALTER TYPE "public"."status" OWNER TO "postgres";


COMMENT ON TYPE "public"."status" IS 'possible status for something';



CREATE TYPE "public"."subscription_status" AS ENUM (
    'active',
    'canceled',
    'expired',
    'renewed'
);


ALTER TYPE "public"."subscription_status" OWNER TO "postgres";


CREATE TYPE "public"."ticket_status" AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed'
);


ALTER TYPE "public"."ticket_status" OWNER TO "postgres";


CREATE TYPE "public"."transaction_status" AS ENUM (
    'pending',
    'successful',
    'failed',
    'archived',
    'canceled'
);


ALTER TYPE "public"."transaction_status" OWNER TO "postgres";


COMMENT ON TYPE "public"."transaction_status" IS 'possible status for transactions';



CREATE OR REPLACE FUNCTION "public"."cancel_subscription"("_user_id" "uuid", "_plan_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Mark the subscription as canceled
    UPDATE subscriptions
    SET subscription_status = 'canceled'
    WHERE user_id = _user_id AND plan_id = _plan_id AND subscription_status = 'active';
END;
$$;


ALTER FUNCTION "public"."cancel_subscription"("_user_id" "uuid", "_plan_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_exam_submission"("p_student_id" "uuid", "p_exam_id" integer, "p_answers" "jsonb") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."create_exam_submission"("p_student_id" "uuid", "p_exam_id" integer, "p_answers" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification"("_user_id" "uuid", "_notification_type" character varying, "_message" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    INSERT INTO notifications (user_id, notification_type, message)
    VALUES (_user_id, _notification_type, _message);
END;
$$;


ALTER FUNCTION "public"."create_notification"("_user_id" "uuid", "_notification_type" character varying, "_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification"("_user_id" "uuid", "_notification_type" "public"."notification_types", "_message" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    INSERT INTO notifications (user_id, notification_type, message)
    VALUES (_user_id, _notification_type, _message);
END;
$$;


ALTER FUNCTION "public"."create_notification"("_user_id" "uuid", "_notification_type" "public"."notification_types", "_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_transaction_for_renewal"("sub_id" integer, "usr_id" "uuid", "pln_id" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."create_transaction_for_renewal"("sub_id" integer, "usr_id" "uuid", "pln_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    AS $$
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


ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enroll_user"("_user_id" "uuid", "_product_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."enroll_user"("_user_id" "uuid", "_product_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_exam_submissions"("p_exam_id" integer) RETURNS TABLE("submission_id" integer, "exam_id" integer, "exam_title" character varying, "student_id" "uuid", "submission_date" timestamp with time zone, "score" numeric, "feedback" "text", "evaluated_at" timestamp with time zone, "is_reviewed" boolean, "full_name" "text")
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."get_exam_submissions"("p_exam_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_subscription"("_user_id" "uuid", "_plan_id" integer, "_transaction_id" integer, "_start_date" timestamp with time zone DEFAULT "now"()) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_subscription"("_user_id" "uuid", "_plan_id" integer, "_transaction_id" integer, "_start_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
    INSERT INTO public.profiles (id, username, avatar_url, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'full_name');
       
    -- Insert default role 'student'
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student');

    RETURN NEW;
END;$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."identify_subscriptions_due_for_renewal"("renewal_period" interval) RETURNS TABLE("user_id" "uuid", "subscription_id" integer, "plan_id" integer, "end_date" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT s.user_id, s.subscription_id, s.plan_id, s.end_date
  FROM subscriptions s
  WHERE s.end_date <= NOW() + renewal_period
    AND s.subscription_status = 'active';
END;
$$;


ALTER FUNCTION "public"."identify_subscriptions_due_for_renewal"("renewal_period" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_users_for_renewal"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    sub_due RECORD;
BEGIN
    FOR sub_due IN
        SELECT * FROM identify_subscriptions_due_for_renewal(INTERVAL '15 days')
    LOOP
        PERFORM create_notification(
            sub_due.user_id,
            'subscription_renewal'::notification_types,  -- Explicitly cast to notification_types
            'Your subscription is nearing expiry. Click to renew.'
        );
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."notify_users_for_renewal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_exam_feedback"("p_submission_id" integer, "p_exam_id" integer, "p_student_id" "uuid", "p_answers" "jsonb", "p_overall_feedback" "text", "p_score" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$

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

$$;


ALTER FUNCTION "public"."save_exam_feedback"("p_submission_id" integer, "p_exam_id" integer, "p_student_id" "uuid", "p_answers" "jsonb", "p_overall_feedback" "text", "p_score" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_manage_transactions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."trigger_manage_transactions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "assignment_id" integer NOT NULL,
    "course_id" integer NOT NULL,
    "title" character varying(100) NOT NULL,
    "description" "text",
    "due_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."assignments_assignment_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."assignments_assignment_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."assignments_assignment_id_seq" OWNED BY "public"."assignments"."assignment_id";



CREATE TABLE IF NOT EXISTS "public"."chats" (
    "chat_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "chat_type" "public"."chat_types" DEFAULT 'free_chat'::"public"."chat_types",
    "title" "text" NOT NULL
);


ALTER TABLE "public"."chats" OWNER TO "postgres";


COMMENT ON COLUMN "public"."chats"."chat_type" IS 'the possible modalities of chats';



COMMENT ON COLUMN "public"."chats"."title" IS 'the title of the chat';



ALTER TABLE "public"."chats" ALTER COLUMN "chat_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."chats_chat_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."comment_flags" (
    "id" bigint NOT NULL,
    "comment_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."comment_flags" OWNER TO "postgres";


ALTER TABLE "public"."comment_flags" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."comment_flags_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."comment_reactions" (
    "id" bigint NOT NULL,
    "comment_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction_type" "public"."reactions" DEFAULT 'like'::"public"."reactions" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."comment_reactions" OWNER TO "postgres";


ALTER TABLE "public"."comment_reactions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."comment_reactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."course_categories" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."course_categories" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."course_categories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."course_categories_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."course_categories_id_seq" OWNED BY "public"."course_categories"."id";



CREATE TABLE IF NOT EXISTS "public"."courses" (
    "course_id" integer NOT NULL,
    "title" character varying(100) NOT NULL,
    "description" "text",
    "thumbnail_url" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "author_id" "uuid",
    "archived_at" timestamp with time zone,
    "tags" "text"[],
    "category_id" integer,
    "status" "public"."status" DEFAULT 'draft'::"public"."status" NOT NULL
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."courses"."status" IS 'status for the course';



CREATE SEQUENCE IF NOT EXISTS "public"."courses_course_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."courses_course_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."courses_course_id_seq" OWNED BY "public"."courses"."course_id";



CREATE TABLE IF NOT EXISTS "public"."exam_views" (
    "id" bigint NOT NULL,
    "exam_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."exam_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exams" (
    "exam_id" integer NOT NULL,
    "course_id" integer NOT NULL,
    "title" character varying(100) NOT NULL,
    "description" "text",
    "exam_date" timestamp with time zone NOT NULL,
    "duration" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone,
    "status" "public"."status" DEFAULT 'draft'::"public"."status",
    "sequence" integer,
    "created_by" "uuid"
);


ALTER TABLE "public"."exams" OWNER TO "postgres";


COMMENT ON COLUMN "public"."exams"."created_by" IS 'the teacher that created the exam';



CREATE OR REPLACE VIEW "public"."distinct_exam_views" AS
 SELECT DISTINCT ON ("ev"."user_id", "ev"."exam_id") "ev"."id" AS "view_id",
    "ev"."exam_id",
    "ev"."user_id",
    "ev"."viewed_at",
    "e"."title" AS "exam_title",
    "e"."course_id" AS "exam_course_id",
    "e"."description" AS "exam_description",
    "e"."exam_date",
    "e"."duration" AS "exam_duration",
    "e"."created_at" AS "exam_created_at",
    "e"."updated_at" AS "exam_updated_at",
    "e"."status" AS "exam_status",
    "e"."sequence" AS "exam_sequence",
    "e"."created_by" AS "exam_created_by"
   FROM ("public"."exam_views" "ev"
     JOIN "public"."exams" "e" ON (("ev"."exam_id" = "e"."exam_id")))
  ORDER BY "ev"."user_id", "ev"."exam_id", "ev"."viewed_at" DESC;


ALTER TABLE "public"."distinct_exam_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_views" (
    "id" bigint NOT NULL,
    "lesson_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lesson_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" bigint NOT NULL,
    "course_id" bigint,
    "sequence" integer,
    "title" "text",
    "content" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "video_url" "text",
    "embed_code" "text",
    "status" "public"."status" DEFAULT 'draft'::"public"."status",
    "description" "text",
    "summary" "text",
    "image" "text"
);


ALTER TABLE "public"."lessons" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lessons"."description" IS 'short description of the lesson';



COMMENT ON COLUMN "public"."lessons"."summary" IS 'this is a summary of the lessons';



COMMENT ON COLUMN "public"."lessons"."image" IS 'The image to show in the page';



CREATE OR REPLACE VIEW "public"."distinct_lesson_views" AS
 SELECT DISTINCT ON ("lv"."user_id", "lv"."lesson_id") "lv"."id" AS "view_id",
    "lv"."lesson_id",
    "lv"."user_id",
    "lv"."viewed_at",
    "l"."title" AS "lesson_title",
    "l"."course_id" AS "lesson_course_id",
    "l"."sequence" AS "lesson_sequence",
    "l"."content" AS "lesson_content",
    "l"."created_at" AS "lesson_created_at",
    "l"."updated_at" AS "lesson_updated_at",
    "l"."video_url" AS "lesson_video_url",
    "l"."embed_code" AS "lesson_embed_code",
    "l"."status" AS "lesson_status",
    "l"."description" AS "lesson_description",
    "l"."summary" AS "lesson_summary",
    "l"."image" AS "lesson_image"
   FROM ("public"."lesson_views" "lv"
     JOIN "public"."lessons" "l" ON (("lv"."lesson_id" = "l"."id")))
  ORDER BY "lv"."user_id", "lv"."lesson_id", "lv"."viewed_at" DESC;


ALTER TABLE "public"."distinct_lesson_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrollments" (
    "enrollment_id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "course_id" integer NOT NULL,
    "enrollment_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "product_id" integer,
    "subscription_id" integer,
    "status" "public"."enrollement_status",
    CONSTRAINT "valid_enrollment" CHECK (((("product_id" IS NOT NULL) AND ("subscription_id" IS NULL)) OR (("product_id" IS NULL) AND ("subscription_id" IS NOT NULL))))
);


ALTER TABLE "public"."enrollments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."enrollments_enrollment_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."enrollments_enrollment_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."enrollments_enrollment_id_seq" OWNED BY "public"."enrollments"."enrollment_id";



CREATE TABLE IF NOT EXISTS "public"."exam_answers" (
    "answer_id" integer NOT NULL,
    "submission_id" integer NOT NULL,
    "question_id" integer NOT NULL,
    "answer_text" "text",
    "is_correct" boolean,
    "feedback" "text"
);


ALTER TABLE "public"."exam_answers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."exam_answers_answer_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."exam_answers_answer_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."exam_answers_answer_id_seq" OWNED BY "public"."exam_answers"."answer_id";



CREATE TABLE IF NOT EXISTS "public"."exam_questions" (
    "question_id" integer NOT NULL,
    "exam_id" integer NOT NULL,
    "question_text" "text" NOT NULL,
    "question_type" character varying(50) NOT NULL,
    CONSTRAINT "exam_questions_question_type_check" CHECK ((("question_type")::"text" = ANY ((ARRAY['true_false'::character varying, 'multiple_choice'::character varying, 'free_text'::character varying])::"text"[])))
);


ALTER TABLE "public"."exam_questions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."exam_questions_question_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."exam_questions_question_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."exam_questions_question_id_seq" OWNED BY "public"."exam_questions"."question_id";



CREATE TABLE IF NOT EXISTS "public"."exam_scores" (
    "score_id" integer NOT NULL,
    "submission_id" integer NOT NULL,
    "student_id" "uuid" NOT NULL,
    "exam_id" integer NOT NULL,
    "score" numeric(5,2),
    "feedback" "text",
    "evaluated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_scores_score_check" CHECK ((("score" >= (0)::numeric) AND ("score" <= (100)::numeric)))
);


ALTER TABLE "public"."exam_scores" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."exam_scores_score_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."exam_scores_score_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."exam_scores_score_id_seq" OWNED BY "public"."exam_scores"."score_id";



CREATE TABLE IF NOT EXISTS "public"."exam_submissions" (
    "submission_id" integer NOT NULL,
    "exam_id" integer NOT NULL,
    "student_id" "uuid" NOT NULL,
    "submission_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "ai_data" "jsonb"
);


ALTER TABLE "public"."exam_submissions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."exam_submissions"."ai_data" IS 'json object with all the custom data';



CREATE SEQUENCE IF NOT EXISTS "public"."exam_submissions_submission_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."exam_submissions_submission_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."exam_submissions_submission_id_seq" OWNED BY "public"."exam_submissions"."submission_id";



ALTER TABLE "public"."exam_views" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."exam_views_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."exams_exam_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."exams_exam_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."exams_exam_id_seq" OWNED BY "public"."exams"."exam_id";



CREATE TABLE IF NOT EXISTS "public"."exercise_code_student_submissions" (
    "id" bigint NOT NULL,
    "exercise_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "submission_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."exercise_code_student_submissions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."exercise_code_student_submissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."exercise_code_student_submissions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."exercise_code_student_submissions_id_seq" OWNED BY "public"."exercise_code_student_submissions"."id";



CREATE TABLE IF NOT EXISTS "public"."exercise_completions" (
    "id" bigint NOT NULL,
    "exercise_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "completed_by" "uuid" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "score" numeric(5,2)
);


ALTER TABLE "public"."exercise_completions" OWNER TO "postgres";


ALTER TABLE "public"."exercise_completions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."exercise_completions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."exercise_files" (
    "id" bigint NOT NULL,
    "exercise_id" bigint NOT NULL,
    "file_path" "text" NOT NULL,
    "content" "text" NOT NULL,
    "file_type" "public"."exercise_file_type" DEFAULT 'code'::"public"."exercise_file_type" NOT NULL
);


ALTER TABLE "public"."exercise_files" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."exercise_files_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."exercise_files_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."exercise_files_id_seq" OWNED BY "public"."exercise_files"."id";



CREATE TABLE IF NOT EXISTS "public"."exercise_messages" (
    "id" bigint NOT NULL,
    "exercise_id" bigint NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "role" "public"."ai_sender_type",
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."exercise_messages" OWNER TO "postgres";


ALTER TABLE "public"."exercise_messages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."exercise_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" bigint NOT NULL,
    "lesson_id" bigint,
    "instructions" "text" NOT NULL,
    "system_prompt" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone,
    "exercise_type" "public"."exercise_type" NOT NULL,
    "difficulty_level" "public"."difficulty_level" NOT NULL,
    "time_limit" integer,
    "title" "text" NOT NULL,
    "description" "text",
    "course_id" integer NOT NULL,
    "active_file" "text",
    "visible_files" "text"[]
);


ALTER TABLE "public"."exercises" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."exercise_view" AS
 SELECT "e"."id",
    "e"."title",
    "e"."description",
    "e"."exercise_type",
    "e"."difficulty_level",
    "e"."time_limit",
    "c"."course_id"
   FROM ("public"."exercises" "e"
     JOIN "public"."courses" "c" ON (("e"."course_id" = "c"."course_id")))
  ORDER BY ("random"());


ALTER TABLE "public"."exercise_view" OWNER TO "postgres";


ALTER TABLE "public"."exercises" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."exercises_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "avatar_url" "text",
    "website" "text",
    "bio" "text",
    "currency_id" integer,
    "stripe_customer_id" "text",
    "username" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "stripeCustomerID" "text",
    "full_name" "text",
    "data_person" "jsonb",
    CONSTRAINT "username_length" CHECK (("char_length"("username") >= 3))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."stripeCustomerID" IS 'Id from stripe';



COMMENT ON COLUMN "public"."profiles"."full_name" IS 'the full name of the user';



COMMENT ON COLUMN "public"."profiles"."data_person" IS 'json col fo now of the traits a person would like to be evaliuate';



CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "entity_type" "public"."reviewable" NOT NULL,
    "entity_id" bigint NOT NULL,
    "rating" integer NOT NULL,
    "review_text" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


COMMENT ON COLUMN "public"."reviews"."entity_type" IS 'the type of entity that could be reviewed';



CREATE OR REPLACE VIEW "public"."get_reviews" AS
 SELECT "reviews"."id" AS "review_id",
    "reviews"."rating",
    "reviews"."review_text",
    "reviews"."created_at",
    "reviews"."entity_id",
    "reviews"."entity_type",
    "profiles"."full_name",
    "profiles"."id" AS "profile_id"
   FROM ("public"."reviews"
     JOIN "public"."profiles" ON (("reviews"."user_id" = "profiles"."id")));


ALTER TABLE "public"."get_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grades" (
    "grade_id" integer NOT NULL,
    "submission_id" integer,
    "student_id" "uuid" NOT NULL,
    "course_id" integer NOT NULL,
    "grade" numeric(5,2),
    "feedback" "text",
    "graded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grades_grade_check" CHECK ((("grade" >= (0)::numeric) AND ("grade" <= (100)::numeric)))
);


ALTER TABLE "public"."grades" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."grades_grade_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."grades_grade_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."grades_grade_id_seq" OWNED BY "public"."grades"."grade_id";



CREATE TABLE IF NOT EXISTS "public"."lesson_comments" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lesson_id" bigint NOT NULL,
    "parent_comment_id" bigint,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."lesson_comments" OWNER TO "postgres";


ALTER TABLE "public"."lesson_comments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lesson_comments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."lesson_completions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lesson_id" bigint NOT NULL,
    "completed_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."lesson_completions" OWNER TO "postgres";


ALTER TABLE "public"."lesson_completions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lesson_completions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."lesson_passed" (
    "id" bigint NOT NULL,
    "lesson_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "passed_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."lesson_passed" OWNER TO "postgres";


ALTER TABLE "public"."lesson_passed" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lesson_passed_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."lesson_views" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lesson_views_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."lessons_ai_task_messages" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "sender" "public"."ai_sender_type",
    "message" "text",
    "lesson_id" bigint
);


ALTER TABLE "public"."lessons_ai_task_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."lessons_ai_task_messages" IS 'the messages between the user and the ai';



ALTER TABLE "public"."lessons_ai_task_messages" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."lessons_ai_task_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."lessons_ai_tasks" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "system_prompt" "text",
    "lesson_id" bigint,
    "task_instructions" "text"
);


ALTER TABLE "public"."lessons_ai_tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lessons_ai_tasks"."task_instructions" IS 'The instructions the user must follow to know what to anwser the AI and get evaluated';



ALTER TABLE "public"."lessons_ai_tasks" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."lessons_ai_tasks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."lessons" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lessons_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "message" "text",
    "chat_id" bigint NOT NULL,
    "sender" "public"."ai_sender_type"
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


ALTER TABLE "public"."messages" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "notification_id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type" "public"."notification_types",
    "message" "text" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "link" "text",
    "shrot_message" "text"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notifications"."link" IS 'where the notification could lead';



COMMENT ON COLUMN "public"."notifications"."shrot_message" IS 'a simple description of the message';



CREATE SEQUENCE IF NOT EXISTS "public"."notifications_notification_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."notifications_notification_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."notifications_notification_id_seq" OWNED BY "public"."notifications"."notification_id";



CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "permission_id" integer NOT NULL,
    "permission_name" character varying(100) NOT NULL
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."permissions_permission_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."permissions_permission_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."permissions_permission_id_seq" OWNED BY "public"."permissions"."permission_id";



CREATE TABLE IF NOT EXISTS "public"."plan_courses" (
    "plan_id" integer NOT NULL,
    "course_id" integer NOT NULL
);


ALTER TABLE "public"."plan_courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "plan_id" integer NOT NULL,
    "plan_name" character varying(100) NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "duration_in_days" integer NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "features" "text",
    "thumbnail" "text",
    "currency" "public"."currency_type",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "plans_duration_in_days_check" CHECK (("duration_in_days" > 0))
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."plans"."features" IS 'all the features in the plan';



COMMENT ON COLUMN "public"."plans"."deleted_at" IS 'if the plan was deleted';



CREATE SEQUENCE IF NOT EXISTS "public"."plans_plan_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."plans_plan_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."plans_plan_id_seq" OWNED BY "public"."plans"."plan_id";



CREATE TABLE IF NOT EXISTS "public"."product_courses" (
    "product_id" integer NOT NULL,
    "course_id" integer NOT NULL
);


ALTER TABLE "public"."product_courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "product_id" integer NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "name" "text" NOT NULL,
    "currency" "public"."currency_type",
    "image" "text"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."products_product_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."products_product_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."products_product_id_seq" OWNED BY "public"."products"."product_id";



CREATE TABLE IF NOT EXISTS "public"."question_options" (
    "option_id" integer NOT NULL,
    "question_id" integer NOT NULL,
    "option_text" "text" NOT NULL,
    "is_correct" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."question_options" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."question_options_option_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."question_options_option_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."question_options_option_id_seq" OWNED BY "public"."question_options"."option_id";



ALTER TABLE "public"."reviews" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."reviews_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" integer NOT NULL,
    "permission_id" integer NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "role_id" integer NOT NULL,
    "role_name" character varying(50) NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."roles_role_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."roles_role_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."roles_role_id_seq" OWNED BY "public"."roles"."role_id";



CREATE TABLE IF NOT EXISTS "public"."submissions" (
    "submission_id" integer NOT NULL,
    "assignment_id" integer NOT NULL,
    "student_id" "uuid" NOT NULL,
    "submission_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "file_path" "text"
);


ALTER TABLE "public"."submissions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."submissions_submission_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."submissions_submission_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."submissions_submission_id_seq" OWNED BY "public"."submissions"."submission_id";



CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "subscription_id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" integer NOT NULL,
    "start_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "end_date" timestamp with time zone NOT NULL,
    "subscription_status" "public"."subscription_status" DEFAULT 'active'::"public"."subscription_status" NOT NULL,
    "transaction_id" integer NOT NULL,
    "cancel_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "canceled_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "trial_start" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "trial_end" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "cancel_at_period_end" boolean,
    "created" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "current_period_start" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "current_period_end" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "ended_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."subscriptions"."subscription_status" IS 'possible status of a subscription';



CREATE SEQUENCE IF NOT EXISTS "public"."subscriptions_subscription_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."subscriptions_subscription_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."subscriptions_subscription_id_seq" OWNED BY "public"."subscriptions"."subscription_id";



CREATE TABLE IF NOT EXISTS "public"."ticket_messages" (
    "message_id" integer NOT NULL,
    "ticket_id" integer,
    "user_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."ticket_messages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ticket_messages_message_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."ticket_messages_message_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ticket_messages_message_id_seq" OWNED BY "public"."ticket_messages"."message_id";



CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "ticket_id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text" NOT NULL,
    "status" "public"."ticket_status" DEFAULT 'open'::"public"."ticket_status",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tickets_ticket_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."tickets_ticket_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tickets_ticket_id_seq" OWNED BY "public"."tickets"."ticket_id";



CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "transaction_id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" integer,
    "plan_id" integer,
    "amount" numeric(10,2) NOT NULL,
    "transaction_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "payment_method" character varying(50),
    "status" "public"."transaction_status" DEFAULT 'pending'::"public"."transaction_status" NOT NULL,
    "currency" "public"."currency_type" DEFAULT 'usd'::"public"."currency_type"
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."transactions_transaction_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."transactions_transaction_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transactions_transaction_id_seq" OWNED BY "public"."transactions"."transaction_id";



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'Application roles for each user.';



ALTER TABLE "public"."user_roles" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_roles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."assignments" ALTER COLUMN "assignment_id" SET DEFAULT "nextval"('"public"."assignments_assignment_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."course_categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."course_categories_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."courses" ALTER COLUMN "course_id" SET DEFAULT "nextval"('"public"."courses_course_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."enrollments" ALTER COLUMN "enrollment_id" SET DEFAULT "nextval"('"public"."enrollments_enrollment_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."exam_answers" ALTER COLUMN "answer_id" SET DEFAULT "nextval"('"public"."exam_answers_answer_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."exam_questions" ALTER COLUMN "question_id" SET DEFAULT "nextval"('"public"."exam_questions_question_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."exam_scores" ALTER COLUMN "score_id" SET DEFAULT "nextval"('"public"."exam_scores_score_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."exam_submissions" ALTER COLUMN "submission_id" SET DEFAULT "nextval"('"public"."exam_submissions_submission_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."exams" ALTER COLUMN "exam_id" SET DEFAULT "nextval"('"public"."exams_exam_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."exercise_code_student_submissions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."exercise_code_student_submissions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."exercise_files" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."exercise_files_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."grades" ALTER COLUMN "grade_id" SET DEFAULT "nextval"('"public"."grades_grade_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."notifications" ALTER COLUMN "notification_id" SET DEFAULT "nextval"('"public"."notifications_notification_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."permissions" ALTER COLUMN "permission_id" SET DEFAULT "nextval"('"public"."permissions_permission_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."plans" ALTER COLUMN "plan_id" SET DEFAULT "nextval"('"public"."plans_plan_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."products" ALTER COLUMN "product_id" SET DEFAULT "nextval"('"public"."products_product_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."question_options" ALTER COLUMN "option_id" SET DEFAULT "nextval"('"public"."question_options_option_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."roles" ALTER COLUMN "role_id" SET DEFAULT "nextval"('"public"."roles_role_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."submissions" ALTER COLUMN "submission_id" SET DEFAULT "nextval"('"public"."submissions_submission_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."subscriptions" ALTER COLUMN "subscription_id" SET DEFAULT "nextval"('"public"."subscriptions_subscription_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ticket_messages" ALTER COLUMN "message_id" SET DEFAULT "nextval"('"public"."ticket_messages_message_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tickets" ALTER COLUMN "ticket_id" SET DEFAULT "nextval"('"public"."tickets_ticket_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transactions" ALTER COLUMN "transaction_id" SET DEFAULT "nextval"('"public"."transactions_transaction_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("assignment_id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("chat_id");



ALTER TABLE ONLY "public"."comment_flags"
    ADD CONSTRAINT "comment_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_categories"
    ADD CONSTRAINT "course_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("course_id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_pkey" PRIMARY KEY ("enrollment_id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_user_id_course_id_key" UNIQUE ("user_id", "course_id");



ALTER TABLE ONLY "public"."exam_answers"
    ADD CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("answer_id");



ALTER TABLE ONLY "public"."exam_questions"
    ADD CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("question_id");



ALTER TABLE ONLY "public"."exam_scores"
    ADD CONSTRAINT "exam_scores_pkey" PRIMARY KEY ("score_id");



ALTER TABLE ONLY "public"."exam_scores"
    ADD CONSTRAINT "exam_scores_submission_id_student_id_exam_id_key" UNIQUE ("submission_id", "student_id", "exam_id");



ALTER TABLE ONLY "public"."exam_submissions"
    ADD CONSTRAINT "exam_submissions_exam_id_student_id_key" UNIQUE ("exam_id", "student_id");



ALTER TABLE ONLY "public"."exam_submissions"
    ADD CONSTRAINT "exam_submissions_pkey" PRIMARY KEY ("submission_id");



ALTER TABLE ONLY "public"."exam_views"
    ADD CONSTRAINT "exam_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_pkey" PRIMARY KEY ("exam_id");



ALTER TABLE ONLY "public"."exercise_code_student_submissions"
    ADD CONSTRAINT "exercise_code_student_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_completions"
    ADD CONSTRAINT "exercise_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_files"
    ADD CONSTRAINT "exercise_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_messages"
    ADD CONSTRAINT "exercise_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grades"
    ADD CONSTRAINT "grades_pkey" PRIMARY KEY ("grade_id");



ALTER TABLE ONLY "public"."grades"
    ADD CONSTRAINT "grades_submission_id_student_id_course_id_key" UNIQUE ("submission_id", "student_id", "course_id");



ALTER TABLE ONLY "public"."lesson_comments"
    ADD CONSTRAINT "lesson_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_completions"
    ADD CONSTRAINT "lesson_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_passed"
    ADD CONSTRAINT "lesson_passed_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_views"
    ADD CONSTRAINT "lesson_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lessons_ai_task_messages"
    ADD CONSTRAINT "lessons_ai_task_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lessons_ai_tasks"
    ADD CONSTRAINT "lessons_ai_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_permission_name_key" UNIQUE ("permission_name");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("permission_id");



ALTER TABLE ONLY "public"."plan_courses"
    ADD CONSTRAINT "plan_courses_pkey" PRIMARY KEY ("plan_id", "course_id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("plan_id");



ALTER TABLE ONLY "public"."product_courses"
    ADD CONSTRAINT "product_courses_pkey" PRIMARY KEY ("product_id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("product_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_pkey" PRIMARY KEY ("option_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("role_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_role_name_key" UNIQUE ("role_name");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_assignment_id_student_id_key" UNIQUE ("assignment_id", "student_id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("submission_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("subscription_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_plan_id_key" UNIQUE ("user_id", "plan_id");



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("message_id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("ticket_id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("transaction_id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_product_id_plan_id_key" UNIQUE ("user_id", "product_id", "plan_id");



ALTER TABLE ONLY "public"."lesson_completions"
    ADD CONSTRAINT "unique_completion" UNIQUE ("user_id", "lesson_id");



ALTER TABLE ONLY "public"."exercise_files"
    ADD CONSTRAINT "unique_file_per_exercise" UNIQUE ("exercise_id", "file_path");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



CREATE OR REPLACE TRIGGER "after_transaction_insert" AFTER INSERT ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_manage_transactions"();



CREATE OR REPLACE TRIGGER "after_transaction_update" AFTER UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_manage_transactions"();



CREATE OR REPLACE TRIGGER "update_tickets_updated_at" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("course_id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_flags"
    ADD CONSTRAINT "comment_flags_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."lesson_comments"("id");



ALTER TABLE ONLY "public"."comment_flags"
    ADD CONSTRAINT "comment_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."lesson_comments"("id");



ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."course_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("course_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("product_id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("subscription_id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_answers"
    ADD CONSTRAINT "exam_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("question_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_answers"
    ADD CONSTRAINT "exam_answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."exam_submissions"("submission_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_questions"
    ADD CONSTRAINT "exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("exam_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_scores"
    ADD CONSTRAINT "exam_scores_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("exam_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_scores"
    ADD CONSTRAINT "exam_scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."exam_scores"
    ADD CONSTRAINT "exam_scores_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."exam_submissions"("submission_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_submissions"
    ADD CONSTRAINT "exam_submissions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("exam_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_submissions"
    ADD CONSTRAINT "exam_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."exam_views"
    ADD CONSTRAINT "exam_views_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("exam_id");



ALTER TABLE ONLY "public"."exam_views"
    ADD CONSTRAINT "exam_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("course_id");



ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_code_student_submissions"
    ADD CONSTRAINT "exercise_code_student_submissions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_code_student_submissions"
    ADD CONSTRAINT "exercise_code_student_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_completions"
    ADD CONSTRAINT "exercise_completions_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_completions"
    ADD CONSTRAINT "exercise_completions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_completions"
    ADD CONSTRAINT "exercise_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_files"
    ADD CONSTRAINT "exercise_files_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_messages"
    ADD CONSTRAINT "exercise_messages_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_messages"
    ADD CONSTRAINT "exercise_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("course_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_courses"
    ADD CONSTRAINT "fk_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("product_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grades"
    ADD CONSTRAINT "grades_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("course_id");



ALTER TABLE ONLY "public"."grades"
    ADD CONSTRAINT "grades_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."grades"
    ADD CONSTRAINT "grades_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."exam_submissions"("submission_id");



ALTER TABLE ONLY "public"."lesson_comments"
    ADD CONSTRAINT "lesson_comments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_comments"
    ADD CONSTRAINT "lesson_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."lesson_comments"("id");



ALTER TABLE ONLY "public"."lesson_comments"
    ADD CONSTRAINT "lesson_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_completions"
    ADD CONSTRAINT "lesson_completions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id");



ALTER TABLE ONLY "public"."lesson_completions"
    ADD CONSTRAINT "lesson_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_passed"
    ADD CONSTRAINT "lesson_passed_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id");



ALTER TABLE ONLY "public"."lesson_passed"
    ADD CONSTRAINT "lesson_passed_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."lesson_views"
    ADD CONSTRAINT "lesson_views_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_views"
    ADD CONSTRAINT "lesson_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lessons_ai_task_messages"
    ADD CONSTRAINT "lessons_ai_task_messages_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lessons_ai_task_messages"
    ADD CONSTRAINT "lessons_ai_task_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lessons_ai_tasks"
    ADD CONSTRAINT "lessons_ai_tasks_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("course_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("chat_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."plan_courses"
    ADD CONSTRAINT "plan_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("course_id");



ALTER TABLE ONLY "public"."plan_courses"
    ADD CONSTRAINT "plan_courses_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("plan_id");



ALTER TABLE ONLY "public"."product_courses"
    ADD CONSTRAINT "product_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("course_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("question_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("permission_id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("role_id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("assignment_id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("plan_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("transaction_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("ticket_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("plan_id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("product_id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow auth admin to read user roles" ON "public"."user_roles" FOR SELECT TO "supabase_auth_admin" USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."lessons_ai_task_messages" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."lessons_ai_tasks" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."messages" FOR SELECT USING (true);



CREATE POLICY "Public profiles are viewable by everyone." ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can insert their own profile." ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can update own profile." ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";





















































































































































































































GRANT ALL ON FUNCTION "public"."cancel_subscription"("_user_id" "uuid", "_plan_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_subscription"("_user_id" "uuid", "_plan_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_subscription"("_user_id" "uuid", "_plan_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_exam_submission"("p_student_id" "uuid", "p_exam_id" integer, "p_answers" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_exam_submission"("p_student_id" "uuid", "p_exam_id" integer, "p_answers" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_exam_submission"("p_student_id" "uuid", "p_exam_id" integer, "p_answers" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"("_user_id" "uuid", "_notification_type" character varying, "_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"("_user_id" "uuid", "_notification_type" character varying, "_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"("_user_id" "uuid", "_notification_type" character varying, "_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"("_user_id" "uuid", "_notification_type" "public"."notification_types", "_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"("_user_id" "uuid", "_notification_type" "public"."notification_types", "_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"("_user_id" "uuid", "_notification_type" "public"."notification_types", "_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_transaction_for_renewal"("sub_id" integer, "usr_id" "uuid", "pln_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_transaction_for_renewal"("sub_id" integer, "usr_id" "uuid", "pln_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_transaction_for_renewal"("sub_id" integer, "usr_id" "uuid", "pln_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."enroll_user"("_user_id" "uuid", "_product_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."enroll_user"("_user_id" "uuid", "_product_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."enroll_user"("_user_id" "uuid", "_product_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_exam_submissions"("p_exam_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_exam_submissions"("p_exam_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_exam_submissions"("p_exam_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_subscription"("_user_id" "uuid", "_plan_id" integer, "_transaction_id" integer, "_start_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_subscription"("_user_id" "uuid", "_plan_id" integer, "_transaction_id" integer, "_start_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_subscription"("_user_id" "uuid", "_plan_id" integer, "_transaction_id" integer, "_start_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."identify_subscriptions_due_for_renewal"("renewal_period" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."identify_subscriptions_due_for_renewal"("renewal_period" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."identify_subscriptions_due_for_renewal"("renewal_period" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_users_for_renewal"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_users_for_renewal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_users_for_renewal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."save_exam_feedback"("p_submission_id" integer, "p_exam_id" integer, "p_student_id" "uuid", "p_answers" "jsonb", "p_overall_feedback" "text", "p_score" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."save_exam_feedback"("p_submission_id" integer, "p_exam_id" integer, "p_student_id" "uuid", "p_answers" "jsonb", "p_overall_feedback" "text", "p_score" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_exam_feedback"("p_submission_id" integer, "p_exam_id" integer, "p_student_id" "uuid", "p_answers" "jsonb", "p_overall_feedback" "text", "p_score" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_manage_transactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_manage_transactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_manage_transactions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



























GRANT ALL ON TABLE "public"."assignments" TO "anon";
GRANT ALL ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."assignments_assignment_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."assignments_assignment_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."assignments_assignment_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON SEQUENCE "public"."chats_chat_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."chats_chat_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."chats_chat_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."comment_flags" TO "anon";
GRANT ALL ON TABLE "public"."comment_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_flags" TO "service_role";



GRANT ALL ON SEQUENCE "public"."comment_flags_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."comment_flags_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."comment_flags_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."comment_reactions" TO "anon";
GRANT ALL ON TABLE "public"."comment_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_reactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."comment_reactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."comment_reactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."comment_reactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."course_categories" TO "anon";
GRANT ALL ON TABLE "public"."course_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."course_categories" TO "service_role";



GRANT ALL ON SEQUENCE "public"."course_categories_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."course_categories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."course_categories_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."courses_course_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."courses_course_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."courses_course_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."exam_views" TO "anon";
GRANT ALL ON TABLE "public"."exam_views" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_views" TO "service_role";



GRANT ALL ON TABLE "public"."exams" TO "anon";
GRANT ALL ON TABLE "public"."exams" TO "authenticated";
GRANT ALL ON TABLE "public"."exams" TO "service_role";



GRANT ALL ON TABLE "public"."distinct_exam_views" TO "anon";
GRANT ALL ON TABLE "public"."distinct_exam_views" TO "authenticated";
GRANT ALL ON TABLE "public"."distinct_exam_views" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_views" TO "anon";
GRANT ALL ON TABLE "public"."lesson_views" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_views" TO "service_role";



GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";



GRANT ALL ON TABLE "public"."distinct_lesson_views" TO "anon";
GRANT ALL ON TABLE "public"."distinct_lesson_views" TO "authenticated";
GRANT ALL ON TABLE "public"."distinct_lesson_views" TO "service_role";



GRANT ALL ON TABLE "public"."enrollments" TO "anon";
GRANT ALL ON TABLE "public"."enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."enrollments_enrollment_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."enrollments_enrollment_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."enrollments_enrollment_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."exam_answers" TO "anon";
GRANT ALL ON TABLE "public"."exam_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_answers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."exam_answers_answer_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exam_answers_answer_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exam_answers_answer_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."exam_questions" TO "anon";
GRANT ALL ON TABLE "public"."exam_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_questions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."exam_questions_question_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exam_questions_question_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exam_questions_question_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."exam_scores" TO "anon";
GRANT ALL ON TABLE "public"."exam_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_scores" TO "service_role";



GRANT ALL ON SEQUENCE "public"."exam_scores_score_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exam_scores_score_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exam_scores_score_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."exam_submissions" TO "anon";
GRANT ALL ON TABLE "public"."exam_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_submissions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."exam_submissions_submission_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exam_submissions_submission_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exam_submissions_submission_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."exam_views_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exam_views_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exam_views_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."exams_exam_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exams_exam_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exams_exam_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_code_student_submissions" TO "anon";
GRANT ALL ON TABLE "public"."exercise_code_student_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_code_student_submissions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."exercise_code_student_submissions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exercise_code_student_submissions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exercise_code_student_submissions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_completions" TO "anon";
GRANT ALL ON TABLE "public"."exercise_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_completions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."exercise_completions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exercise_completions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exercise_completions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_files" TO "anon";
GRANT ALL ON TABLE "public"."exercise_files" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_files" TO "service_role";



GRANT ALL ON SEQUENCE "public"."exercise_files_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exercise_files_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exercise_files_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_messages" TO "anon";
GRANT ALL ON TABLE "public"."exercise_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."exercise_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exercise_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exercise_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."exercises" TO "anon";
GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_view" TO "anon";
GRANT ALL ON TABLE "public"."exercise_view" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_view" TO "service_role";



GRANT ALL ON SEQUENCE "public"."exercises_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exercises_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exercises_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."get_reviews" TO "anon";
GRANT ALL ON TABLE "public"."get_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."get_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."grades" TO "anon";
GRANT ALL ON TABLE "public"."grades" TO "authenticated";
GRANT ALL ON TABLE "public"."grades" TO "service_role";



GRANT ALL ON SEQUENCE "public"."grades_grade_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."grades_grade_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."grades_grade_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_comments" TO "anon";
GRANT ALL ON TABLE "public"."lesson_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_comments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lesson_comments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lesson_comments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lesson_comments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_completions" TO "anon";
GRANT ALL ON TABLE "public"."lesson_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_completions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lesson_completions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lesson_completions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lesson_completions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_passed" TO "anon";
GRANT ALL ON TABLE "public"."lesson_passed" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_passed" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lesson_passed_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lesson_passed_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lesson_passed_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lesson_views_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lesson_views_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lesson_views_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lessons_ai_task_messages" TO "anon";
GRANT ALL ON TABLE "public"."lessons_ai_task_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons_ai_task_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lessons_ai_task_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lessons_ai_task_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lessons_ai_task_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lessons_ai_tasks" TO "anon";
GRANT ALL ON TABLE "public"."lessons_ai_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons_ai_tasks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lessons_ai_tasks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lessons_ai_tasks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lessons_ai_tasks_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lessons_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lessons_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lessons_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notifications_notification_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notifications_notification_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notifications_notification_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."permissions_permission_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."permissions_permission_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."permissions_permission_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."plan_courses" TO "anon";
GRANT ALL ON TABLE "public"."plan_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_courses" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON SEQUENCE "public"."plans_plan_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."plans_plan_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."plans_plan_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_courses" TO "anon";
GRANT ALL ON TABLE "public"."product_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."product_courses" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON SEQUENCE "public"."products_product_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."products_product_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."products_product_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."question_options" TO "anon";
GRANT ALL ON TABLE "public"."question_options" TO "authenticated";
GRANT ALL ON TABLE "public"."question_options" TO "service_role";



GRANT ALL ON SEQUENCE "public"."question_options_option_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."question_options_option_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."question_options_option_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."roles_role_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."roles_role_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."roles_role_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."submissions" TO "anon";
GRANT ALL ON TABLE "public"."submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."submissions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."submissions_submission_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."submissions_submission_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."submissions_submission_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."subscriptions_subscription_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."subscriptions_subscription_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."subscriptions_subscription_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_messages" TO "anon";
GRANT ALL ON TABLE "public"."ticket_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ticket_messages_message_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ticket_messages_message_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ticket_messages_message_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tickets_ticket_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tickets_ticket_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tickets_ticket_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transactions_transaction_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transactions_transaction_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transactions_transaction_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "service_role";
GRANT ALL ON TABLE "public"."user_roles" TO "supabase_auth_admin";



GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























