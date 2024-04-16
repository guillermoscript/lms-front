
i want to create a SAAS app,the app is LMS it should have the basic features of a LMS, like courses, lessons, tests, etc.
Im going to provide you with some SQL for the DB, i want you to improve the tables and also to be able have a great DB.
Im using supabase as BAAS and i want to use all of its features, like RLS, triggers, functions, etc.
I also have some specific requirments for the app, like:

1. different roles for the users, like admin, teacher and student.
2. use supabase RLS for the roles and access control.
3. admin has access to everything
4. teacher can create courses and lessons, can view the students that are enrolled in his courses and can view the progress of the students., can edit their own courses and lessons.
5. student can enroll in courses, can view the lessons they are enrolled in, can view the progress of the lessons and courses, can view the courses they are enrolled in.
6. if users subscription is about to expire (2 days before) send an email to the user to renew the subscription.
7. students with expired subscription can not access the courses they are enrolled in.
8. students who bought a course can access the course forever.
9. students should be able to see their progress in the courses and lessons.
10. teacher should be able to create tests for the students.
11. teacher can view users test submissions.
12. teacher can grade the test submissions.
13. test could be multiple choice, true or false, and fill the input of a question, like a form

this are the tables:

A table containing all accepted currencies.
CREATE TABLE IF NOT EXISTS currencies
(
    code CHARACTER(3) NOT NULL PRIMARY KEY,
    name TEXT  NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
)

This table contains the billable entity that has subscriptions. If you are doing a B2B SAAS, these will be companies.
CREATE TABLE IF NOT EXISTS customers
(
    id BIGSERIAL NOT NULL PRIMARY KEY,
    name CHARACTER VARYING(320) NOT NULL,
    phone CHARACTER VARYING(32) NOT NULL,
    email CHARACTER VARYING(320) NOT NULL,
    currency CHARACTER(3) NOT NULL,
    address1 CHARACTER VARYING(255) NOT NULL,
    address2 CHARACTER VARYING(255),
    city CHARACTER VARYING(255) NOT NULL,
    postal_code CHARACTER VARYING(12) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    CONSTRAINT customer_currency_fkey FOREIGN KEY (currency)
        REFERENCES currencies (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT
)

i also have this profile table that i dont know if sould mix with the customer, 
create table
  public.profiles (
    id uuid not null,
    updated_at timestamp with time zone null,
    username text null,
    full_name text null,
    avatar_url text null,
    website text null,
    constraint profiles_pkey primary key (id),
    constraint profiles_username_key unique (username),
    constraint profiles_id_fkey foreign key (id) references auth.users (id),
    constraint username_length check ((char_length(username) >= 3))
  ) tablespace pg_default;

and in my auth schema im using the user table.
create table
  auth.users (
    instance_id uuid null,
    id uuid not null,
    aud character varying(255) null,
    role character varying(255) null,
    email character varying(255) null,
    encrypted_password character varying(255) null,
    email_confirmed_at timestamp with time zone null,
    invited_at timestamp with time zone null,
    confirmation_token character varying(255) null,
    confirmation_sent_at timestamp with time zone null,
    recovery_token character varying(255) null,
    recovery_sent_at timestamp with time zone null,
    email_change_token_new character varying(255) null,
    email_change character varying(255) null,
    email_change_sent_at timestamp with time zone null,
    last_sign_in_at timestamp with time zone null,
    raw_app_meta_data jsonb null,
    raw_user_meta_data jsonb null,
    is_super_admin boolean null,
    created_at timestamp with time zone null,
    updated_at timestamp with time zone null,
    phone text null default null::character varying,
    phone_confirmed_at timestamp with time zone null,
    phone_change text null default ''::character varying,
    phone_change_token character varying(255) null default ''::character varying,
    phone_change_sent_at timestamp with time zone null,
    confirmed_at timestamp with time zone null,
    email_change_token_current character varying(255) null default ''::character varying,
    email_change_confirm_status smallint null default 0,
    banned_until timestamp with time zone null,
    reauthentication_token character varying(255) null default ''::character varying,
    reauthentication_sent_at timestamp with time zone null,
    is_sso_user boolean not null default false,
    deleted_at timestamp with time zone null,
    constraint users_pkey primary key (id),
    constraint users_phone_key unique (phone),
    constraint users_email_change_confirm_status_check check (
      (
        (email_change_confirm_status >= 0)
        and (email_change_confirm_status <= 2)
      )
    )
  ) tablespace pg_default;

create unique index confirmation_token_idx on auth.users using btree (confirmation_token)
where
  ((confirmation_token)::text !~ '^[0-9 ]*$'::text) tablespace pg_default;

create unique index email_change_token_current_idx on auth.users using btree (email_change_token_current)
where
  (
    (email_change_token_current)::text !~ '^[0-9 ]*$'::text
  ) tablespace pg_default;

create unique index email_change_token_new_idx on auth.users using btree (email_change_token_new)
where
  (
    (email_change_token_new)::text !~ '^[0-9 ]*$'::text
  ) tablespace pg_default;

create unique index reauthentication_token_idx on auth.users using btree (reauthentication_token)
where
  (
    (reauthentication_token)::text !~ '^[0-9 ]*$'::text
  ) tablespace pg_default;

create unique index recovery_token_idx on auth.users using btree (recovery_token)
where
  ((recovery_token)::text !~ '^[0-9 ]*$'::text) tablespace pg_default;

create unique index users_email_partial_key on auth.users using btree (email)
where
  (is_sso_user = false) tablespace pg_default;

create index if not exists users_instance_id_email_idx on auth.users using btree (instance_id, lower((email)::text)) tablespace pg_default;

create index if not exists users_instance_id_idx on auth.users using btree (instance_id) tablespace pg_default;

create trigger on_auth_user_created
after insert on auth.users for each row
execute function handle_new_user ();

Represents anything your SAAS is selling. You might be confused by this table at first glance; but the rationale behind it is that it keeps the invoicing more flexible. If you, for instance, are selling subscriptions, and also maybe a physical product, then you will want to have these as seperate products so that each can be referenced on an invoice line. However, it adds some complexity as all plans will need to reference a product so that it can be added to an invoice line.

CREATE TABLE IF NOT EXISTS products
(
    id BIGSERIAL NOT NULL PRIMARY KEY,
    name CHARACTER varying(255) NOT NULL,
    description CHARACTER varying(1000),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone
)

This table contains the pricing of a product in a specific currency. It has a start and an end date. Only one price per product and currency is allowed in a specific date range. We prevent two active prices for a product, in the same currency, within the same date range with the constraint unique_price_in_interval.

CREATE EXTENSION btree_gist; -- Needed to exlude using gist

CREATE TABLE IF NOT EXISTS products_pricing
(
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    price INTEGER NOT NULL,
    currency CHARACTER(3) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    CONSTRAINT products_pricing_currency_fkey FOREIGN KEY (currency)
        REFERENCES currencies (code) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT,
    CONSTRAINT products_pricing_product_id_fkey FOREIGN KEY (product_id)
        REFERENCES products (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT unique_price_in_interval EXCLUDE USING gist (
        product_id WITH =,
        currency WITH =,
        daterange(from_date, to_date, '[]'::text) WITH &&)
        WHERE (deleted_at IS NULL)
)

CREATE TABLE IF NOT EXISTS plans
(
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL,
    billing_interval integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    CONSTRAINT plans_product_id_fkey FOREIGN KEY (product_id)
        REFERENCES products (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT
)

CREATE TYPE invoice_status AS ENUM ('draft', 'unpaid', 'paid');

CREATE TABLE IF NOT EXISTS invoices
(
    id BIGSERIAL PRIMARY KEY,
    status invoice_status NOT NULL DEFAULT 'unpaid'::invoice_status,
    invoice_number integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1000 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    customer_id BIGINT NOT NULL,
    email character varying(320) NOT NULL,
    name character varying(320) NOT NULL,
    country character varying(2) NOT NULL,
    currency character varying(3) NOT NULL DEFAULT 'USD',
    address1 character varying(255) NOT NULL,
    address2 character varying(255),
    city character varying(255) NOT NULL,
    postal_code character varying(12) NOT NULL,
    phone character varying(24),
    invoice_date timestamp with time zone NOT NULL,
    due_date timestamp with time zone NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number),
    CONSTRAINT invoices_currency_fkey FOREIGN KEY (currency)
        REFERENCES currencies (code) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT,
    CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id)
        REFERENCES customers (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT
)

CREATE TABLE IF NOT EXISTS invoice_line_items
(
    id BIGSERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL,
    product_id BIGINT NOT NULL,
    line_amount integer NOT NULL DEFAULT 0,
    vat_amount integer NOT NULL DEFAULT 0,
    vat_percentage integer NOT NULL DEFAULT 0,
    unit_price numeric(12,2) NOT NULL DEFAULT 0,
    quantity numeric(12,2) NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id)
        REFERENCES invoices (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT invoice_line_items_product_id_fkey FOREIGN KEY (product_id)
        REFERENCES products (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT
)

Last but not least: the subscriptions table. This is the most complex table. It will contain all the necessary data to handle subscription upgrades, downgrades and canceling. Only one row with status ‘active’ per customer is allowed within a start-end timestamp interval. This prevents a customer from having two active subscriptions at the same time.

When a subscription is renewed for a another period, a new row is created in this table.

CREATE TYPE subscription_status AS ENUM ('inactive', 'active', 'upgraded');

CREATE TABLE IF NOT EXISTS subscriptions
(
    id BIGSERIAL PRIMARY KEY,
    status subscription_status NOT NULL,
    customer_id BIGINT NOT NULL,
    plan_id BIGINT NOT NULL,
    invoice_id BIGINT NOT NULL,
    starts_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ends_at timestamp with time zone,
    renewed_at timestamp with time zone,
    renewed_subscription_id BIGINT,
    downgraded_at timestamp with time zone,
    downgraded_to_plan_id BIGINT,
    upgraded_at timestamp with time zone,
    upgraded_to_plan_id BIGINT,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    CONSTRAINT subscriptions_downgraded_to_plan_id_fkey FOREIGN KEY (downgraded_to_plan_id)
        REFERENCES plans (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT subscriptions_invoice_id_fkey FOREIGN KEY (invoice_id)
        REFERENCES invoices (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT subscriptions_customer_id_fkey FOREIGN KEY (customer_id)
        REFERENCES customers (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id)
        REFERENCES plans (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT subscriptions_renewed_subscription_id_fkey FOREIGN KEY (renewed_subscription_id)
        REFERENCES subscriptions (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT subscriptions_upgraded_to_plan_id_fkey FOREIGN KEY (upgraded_to_plan_id)
        REFERENCES plans (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT unique_subscription_in_interval EXCLUDE USING gist (
        customer_id WITH =,
        tstzrange(starts_at, ends_at, '[]'::text) WITH &&)
        WHERE (deleted_at IS NULL AND status = 'active')
)

lets focus on particular features step by step, and you create the necesarry code for that feature, and then we move to the next feature.
first users: I cant modify users table from the auth schema, so thats why there is profile page. combine the customer to the profile table, and add the necesarry fields to the profile table, like address, phone, etc. as the auth table could change on the future. then i want to have the features for the authorization. focus on the steps needed on the users perspective to achieve the requirments



-- Insert into `currencies` table
INSERT INTO currencies (code, name) VALUES 
('USD', 'United States Dollar'),
('EUR', 'Euro'),
('GBP', 'British Pound');

-- Insert into `products` (if exists)
INSERT INTO products (name, description) VALUES 
('Introduction to Programming', 'Learn the fundamentals of programming.'),
('Advanced Math', 'An in-depth look into higher mathematical concepts.');

-- Insert into `course_categories` table
INSERT INTO course_categories (name, description) VALUES 
('Programming', 'All programming related courses'),
('Mathematics', 'Courses related to mathematical concepts');

-- Insert into `courses` table
INSERT INTO courses (product_id, title, description, author_id, status, category_id) VALUES 
(1, 'Intro to Programming', 'A course for absolute beginners.', 'db225ab7-fa1e-4538-8660-9a5b298f476c', 'published', 1),
(2, 'Advanced Mathematics', 'Understand the world of numbers.', 'db225ab7-fa1e-4538-8660-9a5b298f476c', 'published', 2);

-- Insert into `lessons` table
INSERT INTO lessons (course_id, title, content, sequence) VALUES 
(1, 'Lesson 1: What is Programming?', 'Content of lesson 1', 1),
(1, 'Lesson 2: Variables and Data Types', 'Content of lesson 2', 2),
(2, 'Lesson 1: Complex Numbers', 'Content of complex numbers', 1);

-- Insert into `course_enrollments` table
INSERT INTO course_enrollments (course_id, user_id) VALUES 
(1, 'faa44695-301c-469e-909c-0b19405021f3'),
(2, 'faa44695-301c-469e-909c-0b19405021f3');

-- Insert into `course_purchases` table
INSERT INTO course_purchases (user_id, course_id) VALUES 
('faa44695-301c-469e-909c-0b19405021f3', 2);

-- Insert into `tests`
INSERT INTO tests (course_id, title) VALUES 
(1, 'Programming Basics Test'),
(2, 'Mathematics Level 1 Test');

-- Insert into `test_questions`
INSERT INTO test_questions (test_id, question_text, question_type, correct_answer) VALUES 
(1, 'Which language is known as the mother of all programming languages?', 'multiple_choice', 'Fortran'),
(1, 'What does "var" stand for in JavaScript?', 'fill_in', 'variable');
-- Notice that `question_type` needs to be a valid ENUM value

-- Insert into `question_options`
INSERT INTO question_options (question_id, option_text, is_correct) VALUES 
(1, 'C++', FALSE),
(1, 'Fortran', TRUE),
(1, 'Python', FALSE),
(1, 'Java', FALSE);


