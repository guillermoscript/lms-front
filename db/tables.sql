CREATE TYPE public.ai_sender_type AS ENUM (
    'system',
    'user',
    'assistant',
    'function',
    'data',
    'tool'
);

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'moderator',
    'teacher',
    'student'
);

CREATE TYPE public.chat_types AS ENUM (
    'free_chat',
    'q&a',
    'exam_prep',
    'course_convo'
);

CREATE TYPE public.currency_type AS ENUM (
    'usd',
    'eur'
);

CREATE TYPE public.enrollement_status AS ENUM (
    'active',
    'disabled'
);

CREATE TYPE public.notification_types AS ENUM (
    'comment_reply',
    'comment',
    'exam_review',
    'order_renewal'
);

CREATE TYPE public.reactions AS ENUM (
    'like',
    'dislike',
    'boring',
    'funny'
);

CREATE TYPE public.review_status AS ENUM (
    'approved',
    'pending',
    'failed'
);

CREATE TYPE public.reviewable AS ENUM (
    'lessons',
    'courses',
    'exams'
);

CREATE TYPE public.status AS ENUM (
    'published',
    'draft',
    'archived'
);

CREATE TYPE public.subscription_status AS ENUM (
    'active',
    'canceled',
    'expired',
    'renewed'
);

CREATE TYPE public.ticket_status AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed'
);

CREATE TYPE public.transaction_status AS ENUM (
    'pending',
    'successful',
    'failed',
    'archived',
    'canceled'
);

CREATE TYPE public.exercise_type AS ENUM(
  'quiz',
  'coding_challenge',
  'essay',
  'multiple_choice',
  'true_false',
  'fill_in_the_blank',
  'discussion'
);

CREATE TYPE public.difficulty_level AS ENUM('easy', 'medium', 'hard');

create table
  public.course_categories (
    id serial not null,
    name text not null,
    description text null,
    created_at timestamp with time zone null default current_timestamp,
    updated_at timestamp with time zone null,
    deleted_at timestamp with time zone null,
    constraint course_categories_pkey primary key (id)
  ) tablespace pg_default;

  create table
  public.permissions (
    permission_id serial not null,
    permission_name character varying(100) not null,
    constraint permissions_pkey primary key (permission_id),
    constraint permissions_permission_name_key unique (permission_name)
  ) tablespace pg_default;

  create table
  public.roles (
    role_id serial not null,
    role_name character varying(50) not null,
    constraint roles_pkey primary key (role_id),
    constraint roles_role_name_key unique (role_name)
  ) tablespace pg_default;

  create table
  public.plans (
    plan_id serial not null,
    plan_name character varying(100) not null,
    price numeric(10, 2) not null,
    duration_in_days integer not null,
    description text null,
    created_at timestamp with time zone null default current_timestamp,
    features text null,
    thumbnail text null,
    currency public.currency_type null,
    deleted_at timestamp with time zone null,
    constraint plans_pkey primary key (plan_id),
    constraint plans_duration_in_days_check check ((duration_in_days > 0))
  ) tablespace pg_default;

  create table
  public.products (
    product_id serial not null,
    price numeric(10, 2) not null,
    description text null,
    created_at timestamp with time zone null default current_timestamp,
    name text not null,
    currency public.currency_type null,
    image text null,
    constraint products_pkey primary key (product_id)
  ) tablespace pg_default;

  create table
  public.profiles (
    id uuid not null,
    avatar_url text null,
    website text null,
    bio text null,
    currency_id integer null,
    stripe_customer_id text null,
    username text null,
    created_at timestamp with time zone null default current_timestamp,
    "stripeCustomerID" text null,
    full_name text null,
    data_person jsonb null,
    constraint profiles_pkey primary key (id),
    constraint profiles_username_key unique (username),
    constraint profiles_id_fkey foreign key (id) references auth.users (id) on update cascade on delete cascade,
    constraint username_length check ((char_length(username) >= 3))
  ) tablespace pg_default;



--- level 1
  create table
  public.courses (
    course_id serial not null,
    title character varying(100) not null,
    description text null,
    thumbnail_url text null,
    created_at timestamp with time zone null default current_timestamp,
    updated_at timestamp with time zone null,
    published_at timestamp with time zone null,
    deleted_at timestamp with time zone null,
    author_id uuid null,
    archived_at timestamp with time zone null,
    tags text[] null,
    category_id integer null,
    status public.status not null default 'draft'::status,
    constraint courses_pkey primary key (course_id),
    constraint courses_author_id_fkey foreign key (author_id) references auth.users (id),
    constraint courses_category_id_fkey foreign key (category_id) references course_categories (id) on delete set null
  ) tablespace pg_default;



  create table
  public.transactions (
    transaction_id serial not null,
    user_id uuid not null,
    product_id integer null,
    plan_id integer null,
    amount numeric(10, 2) not null,
    transaction_date timestamp with time zone not null default current_timestamp,
    payment_method character varying(50) null,
    status public.transaction_status not null default 'pending'::transaction_status,
    currency public.currency_type null default 'usd'::currency_type,
    constraint transactions_pkey primary key (transaction_id),
    constraint transactions_user_id_product_id_plan_id_key unique (user_id, product_id, plan_id),
    constraint transactions_plan_id_fkey foreign key (plan_id) references plans (plan_id),
    constraint transactions_product_id_fkey foreign key (product_id) references products (product_id),
    constraint transactions_user_id_fkey foreign key (user_id) references auth.users (id) on update cascade on delete cascade
  ) tablespace pg_default;

-- create trigger after_transaction_insert
-- after insert on transactions for each row
-- execute function trigger_manage_transactions ();

-- create trigger after_transaction_update
-- after
-- update on transactions for each row
-- execute function trigger_manage_transactions ();

create table
  public.user_roles (
    id bigint generated by default as identity not null,
    user_id uuid not null,
    role public.app_role not null,
    constraint user_roles_pkey primary key (id),
    constraint user_roles_user_id_role_key unique (user_id, role),
    constraint user_roles_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
  ) tablespace pg_default;

  create table
  public.tickets (
    ticket_id serial not null,
    user_id uuid not null,
    title character varying(255) not null,
    description text not null,
    status public.ticket_status null default 'open'::ticket_status,
    created_at timestamp without time zone null default current_timestamp,
    updated_at timestamp without time zone null default current_timestamp,
    constraint tickets_pkey primary key (ticket_id),
    constraint tickets_user_id_fkey foreign key (user_id) references auth.users (id)
  ) tablespace pg_default;

-- create trigger update_tickets_updated_at before
-- update on tickets for each row
-- execute function update_updated_at_column ();

create table
  public.notifications (
    notification_id serial not null,
    user_id uuid not null,
    notification_type public.notification_types null,
    message text not null,
    read boolean not null default false,
    created_at timestamp with time zone not null default current_timestamp,
    link text null,
    shrot_message text null,
    constraint notifications_pkey primary key (notification_id),
    constraint notifications_user_id_fkey foreign key (user_id) references auth.users (id)
  ) tablespace pg_default;

-- levle 2
  create table
  public.subscriptions (
    subscription_id serial not null,
    user_id uuid not null,
    plan_id integer not null,
    start_date timestamp with time zone not null default current_timestamp,
    end_date timestamp with time zone not null,
    subscription_status public.subscription_status not null default 'active'::subscription_status,
    transaction_id integer not null,
    cancel_at timestamp with time zone not null default timezone ('utc'::text, now()),
    canceled_at timestamp with time zone null default timezone ('utc'::text, now()),
    trial_start timestamp with time zone null default timezone ('utc'::text, now()),
    trial_end timestamp with time zone null default timezone ('utc'::text, now()),
    cancel_at_period_end boolean null,
    created timestamp with time zone not null default timezone ('utc'::text, now()),
    current_period_start timestamp with time zone not null default timezone ('utc'::text, now()),
    current_period_end timestamp with time zone not null default timezone ('utc'::text, now()),
    ended_at timestamp with time zone null default timezone ('utc'::text, now()),
    constraint subscriptions_pkey primary key (subscription_id),
    constraint subscriptions_user_id_plan_id_key unique (user_id, plan_id),
    constraint subscriptions_plan_id_fkey foreign key (plan_id) references plans (plan_id),
    constraint subscriptions_transaction_id_fkey foreign key (transaction_id) references transactions (transaction_id) on update cascade on delete cascade,
    constraint subscriptions_user_id_fkey foreign key (user_id) references auth.users (id) on update cascade on delete cascade
  ) tablespace pg_default;

  create table
  public.assignments (
    assignment_id serial not null,
    course_id integer not null,
    title character varying(100) not null,
    description text null,
    due_date timestamp with time zone null,
    created_at timestamp with time zone null default current_timestamp,
    constraint assignments_pkey primary key (assignment_id),
    constraint assignments_course_id_fkey foreign key (course_id) references courses (course_id)
  ) tablespace pg_default;

  create table
  public.exams (
    exam_id serial not null,
    course_id integer not null,
    title character varying(100) not null,
    description text null,
    exam_date timestamp with time zone not null,
    duration integer not null,
    created_at timestamp with time zone null default current_timestamp,
    updated_at timestamp with time zone null,
    status public.status null default 'draft'::status,
    sequence integer null,
    created_by uuid null,
    constraint exams_pkey primary key (exam_id),
    constraint exams_course_id_fkey foreign key (course_id) references courses (course_id),
    constraint exams_created_by_fkey foreign key (created_by) references auth.users (id) on update cascade on delete cascade
  ) tablespace pg_default;

  create table
  public.lessons (
    id bigint generated always as identity not null,
    course_id bigint null,
    sequence integer null,
    title text null,
    content text null,
    created_at timestamp with time zone null,
    updated_at timestamp with time zone null,
    video_url text null,
    embed_code text null,
    status public.status null default 'draft'::status,
    description text null,
    summary text null,
    image text null,
    constraint lessons_pkey primary key (id),
    constraint lessons_course_id_fkey foreign key (course_id) references courses (course_id) on update cascade on delete cascade
  ) tablespace pg_default;

  create table
  public.plan_courses (
    plan_id integer not null,
    course_id integer not null,
    constraint plan_courses_pkey primary key (plan_id, course_id),
    constraint plan_courses_course_id_fkey foreign key (course_id) references courses (course_id),
    constraint plan_courses_plan_id_fkey foreign key (plan_id) references plans (plan_id)
  ) tablespace pg_default;

  create table
  public.product_courses (
    product_id integer not null,
    course_id integer not null,
    constraint product_courses_pkey primary key (product_id),
    constraint fk_product foreign key (product_id) references products (product_id) on delete cascade,
    constraint product_courses_course_id_fkey foreign key (course_id) references courses (course_id)
  ) tablespace pg_default;

  create table
  public.enrollments (
    enrollment_id serial not null,
    user_id uuid not null,
    course_id integer not null,
    enrollment_date timestamp with time zone null default current_timestamp,
    product_id integer null,
    subscription_id integer null,
    status public.enrollement_status null,
    constraint enrollments_pkey primary key (enrollment_id),
    constraint enrollments_user_id_course_id_key unique (user_id, course_id),
    constraint enrollments_course_id_fkey foreign key (course_id) references courses (course_id) on update cascade on delete cascade,
    constraint enrollments_user_id_fkey foreign key (user_id) references auth.users (id) on update cascade on delete cascade,
    constraint enrollments_subscription_id_fkey foreign key (subscription_id) references subscriptions (subscription_id),
    constraint enrollments_product_id_fkey foreign key (product_id) references products (product_id),
    constraint valid_enrollment check (
      (
        (
          (product_id is not null)
          and (subscription_id is null)
        )
        or (
          (product_id is null)
          and (subscription_id is not null)
        )
      )
    )
  ) tablespace pg_default;

  create table
  public.chats (
    chat_id bigint generated by default as identity not null,
    user_id uuid not null,
    created_at timestamp without time zone null default current_timestamp,
    chat_type public.chat_types null default 'free_chat'::chat_types,
    title text not null,
    constraint chats_pkey primary key (chat_id),
    constraint chats_user_id_fkey foreign key (user_id) references auth.users (id) on update cascade on delete cascade
  ) tablespace pg_default;

  create table
  public.reviews (
    id bigint generated always as identity not null,
    user_id uuid not null,
    entity_type public.reviewable not null,
    entity_id bigint not null,
    rating integer not null,
    review_text text null,
    created_at timestamp with time zone null default current_timestamp,
    updated_at timestamp with time zone null default current_timestamp,
    constraint reviews_pkey primary key (id),
    constraint reviews_user_id_fkey foreign key (user_id) references auth.users (id),
    constraint reviews_rating_check check (
      (
        (rating >= 1)
        and (rating <= 5)
      )
    )
  ) tablespace pg_default;

  

create table
  public.lesson_comments (
    id bigint generated always as identity not null,
    user_id uuid not null,
    lesson_id bigint not null,
    parent_comment_id bigint null,
    content text not null,
    created_at timestamp with time zone null default current_timestamp,
    updated_at timestamp with time zone null,
    constraint lesson_comments_pkey primary key (id),
    constraint lesson_comments_lesson_id_fkey foreign key (lesson_id) references lessons (id) on update cascade on delete cascade,
    constraint lesson_comments_parent_comment_id_fkey foreign key (parent_comment_id) references lesson_comments (id),
    constraint lesson_comments_user_id_fkey foreign key (user_id) references profiles (id) on update cascade on delete cascade
  ) tablespace pg_default;

  create table
  public.lesson_completions (
    id bigint generated always as identity not null,
    user_id uuid not null,
    lesson_id bigint not null,
    completed_at timestamp with time zone null default current_timestamp,
    constraint lesson_completions_pkey primary key (id),
    constraint unique_completion unique (user_id, lesson_id),
    constraint lesson_completions_lesson_id_fkey foreign key (lesson_id) references lessons (id),
    constraint lesson_completions_user_id_fkey foreign key (user_id) references profiles (id) on update cascade on delete cascade
  ) tablespace pg_default;

  create table
  public.lesson_passed (
    id bigint generated always as identity not null,
    lesson_id bigint not null,
    user_id uuid not null,
    passed_at timestamp with time zone null default current_timestamp,
    constraint lesson_passed_pkey primary key (id),
    constraint lesson_passed_lesson_id_fkey foreign key (lesson_id) references lessons (id),
    constraint lesson_passed_user_id_fkey foreign key (user_id) references auth.users (id)
  ) tablespace pg_default;

  create table
  public.lesson_views (
    id bigint generated always as identity not null,
    lesson_id bigint not null,
    user_id uuid not null,
    viewed_at timestamp with time zone not null default now(),
    constraint lesson_views_pkey primary key (id),
    constraint lesson_views_lesson_id_fkey foreign key (lesson_id) references lessons (id) on update cascade on delete cascade,
    constraint lesson_views_user_id_fkey foreign key (user_id) references auth.users (id) on update cascade on delete cascade
  ) tablespace pg_default;

  create table
  public.lessons_ai_task_messages (
    id bigint generated by default as identity not null,
    created_at timestamp with time zone not null default now(),
    user_id uuid null,
    sender public.ai_sender_type null,
    message text null,
    lesson_id bigint null,
    constraint lessons_ai_task_messages_pkey primary key (id),
    constraint lessons_ai_task_messages_lesson_id_fkey foreign key (lesson_id) references lessons (id) on update cascade on delete cascade,
    constraint lessons_ai_task_messages_user_id_fkey foreign key (user_id) references auth.users (id) on update cascade on delete cascade
  ) tablespace pg_default;

  create table
  public.lessons_ai_tasks (
    id bigint generated by default as identity not null,
    created_at timestamp with time zone not null default now(),
    system_prompt text null,
    lesson_id bigint null,
    task_instructions text null,
    constraint lessons_ai_tasks_pkey primary key (id),
    constraint lessons_ai_tasks_lesson_id_fkey foreign key (lesson_id) references lessons (id) on update cascade on delete cascade
  ) tablespace pg_default;

  create table
  public.messages (
    id bigint generated by default as identity not null,
    created_at timestamp with time zone not null default now(),
    message text null,
    chat_id bigint not null,
    sender public.ai_sender_type null,
    constraint messages_pkey primary key (id),
    constraint messages_chat_id_fkey foreign key (chat_id) references chats (chat_id) on delete cascade
  ) tablespace pg_default;

  create table
  public.role_permissions (
    role_id integer not null,
    permission_id integer not null,
    constraint role_permissions_pkey primary key (role_id, permission_id),
    constraint role_permissions_permission_id_fkey foreign key (permission_id) references permissions (permission_id),
    constraint role_permissions_role_id_fkey foreign key (role_id) references roles (role_id)
  ) tablespace pg_default;

  create table
  public.ticket_messages (
    message_id serial not null,
    ticket_id integer null,
    user_id uuid not null,
    message text not null,
    created_at timestamp without time zone null default current_timestamp,
    constraint ticket_messages_pkey primary key (message_id),
    constraint ticket_messages_ticket_id_fkey foreign key (ticket_id) references tickets (ticket_id) on delete cascade,
    constraint ticket_messages_user_id_fkey foreign key (user_id) references auth.users (id)
  ) tablespace pg_default;


---- level 3
  create table
  public.exam_questions (
    question_id serial not null,
    exam_id integer not null,
    question_text text not null,
    question_type character varying(50) not null,
    constraint exam_questions_pkey primary key (question_id),
    constraint exam_questions_exam_id_fkey foreign key (exam_id) references exams (exam_id) on update cascade on delete cascade,
    constraint exam_questions_question_type_check check (
      (
        (question_type)::text = any (
          (
            array[
              'true_false'::character varying,
              'multiple_choice'::character varying,
              'free_text'::character varying
            ]
          )::text[]
        )
      )
    )
  ) tablespace pg_default;

  create table
  public.exam_submissions (
    submission_id serial not null,
    exam_id integer not null,
    student_id uuid not null,
    submission_date timestamp with time zone null default current_timestamp,
    ai_data jsonb null,
    constraint exam_submissions_pkey primary key (submission_id),
    constraint exam_submissions_exam_id_student_id_key unique (exam_id, student_id),
    constraint exam_submissions_exam_id_fkey foreign key (exam_id) references exams (exam_id) on update cascade on delete cascade,
    constraint exam_submissions_student_id_fkey foreign key (student_id) references auth.users (id)
  ) tablespace pg_default;

create table
  public.exam_views (
    id bigint generated always as identity not null,
    exam_id bigint not null,
    user_id uuid not null,
    viewed_at timestamp with time zone not null default now(),
    constraint exam_views_pkey primary key (id),
    constraint exam_views_exam_id_fkey foreign key (exam_id) references exams (exam_id),
    constraint exam_views_user_id_fkey foreign key (user_id) references auth.users (id)
  ) tablespace pg_default;

  create table
  public.grades (
    grade_id serial not null,
    submission_id integer null,
    student_id uuid not null,
    course_id integer not null,
    grade numeric(5, 2) null,
    feedback text null,
    graded_at timestamp with time zone null default current_timestamp,
    constraint grades_pkey primary key (grade_id),
    constraint grades_submission_id_student_id_course_id_key unique (submission_id, student_id, course_id),
    constraint grades_course_id_fkey foreign key (course_id) references courses (course_id),
    constraint grades_student_id_fkey foreign key (student_id) references auth.users (id),
    constraint grades_submission_id_fkey foreign key (submission_id) references exam_submissions (submission_id),
    constraint grades_grade_check check (
      (
        (grade >= (0)::numeric)
        and (grade <= (100)::numeric)
      )
    )
  ) tablespace pg_default;

  create table
  public.exam_scores (
    score_id serial not null,
    submission_id integer not null,
    student_id uuid not null,
    exam_id integer not null,
    score numeric(5, 2) null,
    feedback text null,
    evaluated_at timestamp with time zone null default current_timestamp,
    constraint exam_scores_pkey primary key (score_id),
    constraint exam_scores_submission_id_student_id_exam_id_key unique (submission_id, student_id, exam_id),
    constraint exam_scores_exam_id_fkey foreign key (exam_id) references exams (exam_id) on update cascade on delete cascade,
    constraint exam_scores_student_id_fkey foreign key (student_id) references auth.users (id),
    constraint exam_scores_submission_id_fkey foreign key (submission_id) references exam_submissions (submission_id) on update cascade on delete cascade,
    constraint exam_scores_score_check check (
      (
        (score >= (0)::numeric)
        and (score <= (100)::numeric)
      )
    )
  ) tablespace pg_default;

  create table
  public.exam_answers (
    answer_id serial not null,
    submission_id integer not null,
    question_id integer not null,
    answer_text text null,
    is_correct boolean null,
    feedback text null,
    constraint exam_answers_pkey primary key (answer_id),
    constraint exam_answers_question_id_fkey foreign key (question_id) references exam_questions (question_id) on delete cascade,
    constraint exam_answers_submission_id_fkey foreign key (submission_id) references exam_submissions (submission_id) on update cascade on delete cascade
  ) tablespace pg_default;

  create table
  public.question_options (
    option_id serial not null,
    question_id integer not null,
    option_text text not null,
    is_correct boolean not null default false,
    constraint question_options_pkey primary key (option_id),
    constraint question_options_question_id_fkey foreign key (question_id) references exam_questions (question_id) on delete cascade
  ) tablespace pg_default;

  create table
  public.submissions (
    submission_id serial not null,
    assignment_id integer not null,
    student_id uuid not null,
    submission_date timestamp with time zone null default current_timestamp,
    file_path text null,
    constraint submissions_pkey primary key (submission_id),
    constraint submissions_assignment_id_student_id_key unique (assignment_id, student_id),
    constraint submissions_assignment_id_fkey foreign key (assignment_id) references assignments (assignment_id),
    constraint submissions_student_id_fkey foreign key (student_id) references auth.users (id)
  ) tablespace pg_default;


  create table
  public.comment_flags (
    id bigint generated always as identity not null,
    comment_id bigint not null,
    user_id uuid not null,
    reason text not null,
    created_at timestamp with time zone null default current_timestamp,
    constraint comment_flags_pkey primary key (id),
    constraint comment_flags_comment_id_fkey foreign key (comment_id) references lesson_comments (id),
    constraint comment_flags_user_id_fkey foreign key (user_id) references profiles (id)
  ) tablespace pg_default;
  
  create table
  public.comment_reactions (
    id bigint generated always as identity not null,
    comment_id bigint not null,
    user_id uuid not null,
    reaction_type public.reactions not null default 'like'::reactions,
    created_at timestamp with time zone null default current_timestamp,
    constraint comment_reactions_pkey primary key (id),
    constraint comment_reactions_comment_id_fkey foreign key (comment_id) references lesson_comments (id),
    constraint comment_reactions_user_id_fkey foreign key (user_id) references profiles (id)
  ) tablespace pg_default;

create table
  public.exercises (
    id bigint generated always as identity not null,
    lesson_id bigint null,
    instructions text not null,
    system_prompt text null,
    created_by uuid not null,
    created_at timestamp with time zone null default current_timestamp,
    updated_at timestamp with time zone null,
    exercise_type public.exercise_type not null,
    difficulty_level public.difficulty_level not null,
    time_limit integer null,
    title text not null,
    description text null,
    course_id integer not null,
    constraint exercises_pkey primary key (id),
    constraint exercises_course_id_fkey foreign key (course_id) references courses (course_id) on update cascade on delete cascade,
    constraint exercises_created_by_fkey foreign key (created_by) references auth.users (id) on delete cascade,
    constraint exercises_lesson_id_fkey foreign key (lesson_id) references lessons (id) on update cascade on delete set null
  ) tablespace pg_default;

  create table
  public.exercise_messages (
    id bigint generated always as identity not null,
    exercise_id bigint not null,
    message text not null,
    created_at timestamp with time zone null default current_timestamp,
    constraint exercise_messages_pkey primary key (id),
    constraint exercise_messages_exercise_id_fkey foreign key (exercise_id) references exercises (id) on delete cascade
  ) tablespace pg_default;

  create table
  public.exercise_completions (
    id bigint generated always as identity not null,
    exercise_id bigint not null,
    user_id uuid not null,
    completed_by uuid not null,
    completed_at timestamp with time zone null default current_timestamp,
    score numeric(5, 2) null,
    constraint exercise_completions_pkey primary key (id),
    constraint exercise_completions_completed_by_fkey foreign key (completed_by) references auth.users (id) on delete cascade,
    constraint exercise_completions_exercise_id_fkey foreign key (exercise_id) references exercises (id) on delete cascade,
    constraint exercise_completions_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
  ) tablespace pg_default;