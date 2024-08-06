-- Insert data into auth.users for foreign key constraints
INSERT INTO auth.users (id, email) VALUES
('c56a4180-65aa-42ec-a945-5fd21dec0538', 'user1@example.com'),
('c56a4180-65aa-42ec-a945-5fd21dec0539', 'user2@example.com'),
('c56a4180-65aa-42ec-a945-5fd21dec053a', 'user3@example.com');

-- Insert data into schemas used in enums
CREATE TYPE public.chat_types AS ENUM ('free_chat', 'paid_chat');
CREATE TYPE public.notification_types AS ENUM ('info', 'warning', 'error');
CREATE TYPE public.reactions AS ENUM ('like', 'dislike', 'love');
CREATE TYPE public.reviewable AS ENUM ('course', 'lesson');
CREATE TYPE public.ai_sender_type AS ENUM ('system', 'user');
CREATE TYPE public.currency_type AS ENUM ('usd', 'eur', 'gbp');
CREATE TYPE public.status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE public.subscription_status AS ENUM ('active', 'inactive', 'canceled', 'pending');
CREATE TYPE public.transaction_status AS ENUM ('pending', 'completed');
CREATE TYPE public.enrollement_status AS ENUM ('active', 'inactive');
CREATE TYPE public.app_role AS ENUM ('admin', 'instructor', 'student');

-- Insert data into public.courses
INSERT INTO public.course_categories (name, description) VALUES
('Science', 'Courses related to Science'),
('Arts', 'Courses related to Arts'),
('Technology', 'Courses related to Technology');

-- Insert data into public.courses
INSERT INTO public.courses (title, description, author_id, category_id, status) VALUES
('Physics 101', 'An introductory course on Physics', 'c56a4180-65aa-42ec-a945-5fd21dec0538', 1, 'published'),
('Art History', 'A comprehensive overview of Art History', 'c56a4180-65aa-42ec-a945-5fd21dec0539', 2, 'draft'),
('Web Development', 'Learn the fundamentals of web development', 'c56a4180-65aa-42ec-a945-5fd21dec053a', 3, 'published');

-- Insert data into public.lessons
INSERT INTO public.lessons (course_id, sequence, title, content, status) VALUES
(1, 1, 'Lesson 1: Introduction to Physics', 'Content of lesson 1', 'published'),
(1, 2, 'Lesson 2: Newtonian Mechanics', 'Content of lesson 2', 'published'),
(2, 1, 'Lesson 1: What is Art?', 'Content of lesson 1', 'draft'),
(3, 1, 'Lesson 1: HTML Basics', 'Content of lesson 1', 'published'),
(3, 2, 'Lesson 2: CSS Fundamentals', 'Content of lesson 2', 'published');

-- Insert data into public.assignments
INSERT INTO public.assignments (course_id, title, description, due_date) VALUES
(1, 'Assignment 1: Basic Concepts', 'Solve the basic problems on concepts', '2023-10-01 10:00:00+00'),
(3, 'Assignment 1: HTML Project', 'Create a basic HTML page', '2023-10-05 10:00:00+00');

-- Insert data into public.enrollments
INSERT INTO public.enrollments (user_id, course_id, status) VALUES
('c56a4180-65aa-42ec-a945-5fd21dec0538', 1, 'active'),
('c56a4180-65aa-42ec-a945-5fd21dec0539', 2, 'active'),
('c56a4180-65aa-42ec-a945-5fd21dec053a', 3, 'active');

-- Insert data into public.exam_questions
INSERT INTO public.exams (course_id, title, description, exam_date, duration, status) VALUES
(1, 'Mid-term Exam', 'Covers the first half of the course', '2023-11-01 10:00:00+00', 120, 'draft'),
(3, 'Web Dev Exam I', 'Covers HTML and CSS', '2023-11-05 10:00:00+00', 90, 'published');

INSERT INTO public.exam_questions (exam_id, question_text, question_type) VALUES
(1, 'What is Newton\'s first law?', 'free_text'),
(1, 'Is the Earth flat?', 'true_false');

-- Insert data into public.exam_answers
INSERT INTO public.exam_submissions (exam_id, student_id, submission_date) VALUES
(1, 'c56a4180-65aa-42ec-a945-5fd21dec0538', '2023-10-02 10:00:00+00');

INSERT INTO public.exam_answers (submission_id, question_id, answer_text, is_correct) VALUES
(1, 1, 'Newton\'s first law states...', true),
(1, 2, 'False', true);

-- Insert data into public.messages
INSERT INTO public.chats (user_id, title) VALUES
('c56a4180-65aa-42ec-a945-5fd21dec0538', 'Chat about Physics');

-- Insert data into public.messages
INSERT INTO public.messages (chat_id, message, sender) VALUES
(1, 'Hello, let\'s discuss Physics!', 'user');

-- Insert data into public.subscriptions
INSERT INTO public.plans (plan_name, price, duration_in_days) VALUES
('Monthly Plan', 10.00, 30);

INSERT INTO public.subscriptions (user_id, plan_id, end_date, subscription_status, transaction_id) VALUES
('c56a4180-65aa-42ec-a945-5fd21dec053a', 1, '2023-12-01 10:00:00+00', 'active', 1);

INSERT INTO public.transactions (user_id, product_id, plan_id, amount, transaction_date, status) VALUES
('c56a4180-65aa-42ec-a945-5fd21dec053a', null, 1, 10.00, '2023-10-01 10:00:00+00', 'completed');

INSERT INTO public.reviews (user_id, entity_type, entity_id, rating, review_text) VALUES
('c56a4180-65aa-42ec-a945-5fd21dec0538', 'course', 1, 5, 'Great course! Highly recommend.');

-- Insert data into public.notifications
INSERT INTO public.notifications (user_id, notification_type, message, link) VALUES
('c56a4180-65aa-42ec-a945-5fd21dec0538', 'info', 'Your course has been updated.', 'http://example.com/course/1');

-- Insert data into public.exam_scores
INSERT INTO public.exam_scores (submission_id, student_id, exam_id, score) VALUES
(1, 'c56a4180-65aa-42ec-a945-5fd21dec0538', 1, 90);

-- Insert data into public.grades
INSERT INTO public.grades (submission_id, student_id, course_id, grade) VALUES
(1, 'c56a4180-65aa-42ec-a945-5fd21dec0538', 1, 95);

-- Insert data into public.permissions
INSERT INTO public.permissions (permission_name) VALUES
('view_courses'),
('edit_courses'),
('delete_courses');

-- Insert data into public.roles
INSERT INTO public.roles (role_name) VALUES
('admin'),
('instructor'),
('student');

-- Insert data into public.role_permissions
INSERT INTO public.role_permissions (role_id, permission_id) VALUES
(1, 1),
(1, 2),
(1, 3),
(2, 1),
(2, 2),
(3, 1);

-- Insert data into public.user_roles
INSERT INTO public.user_roles (user_id, role) VALUES
('c56a4180-65aa-42ec-a945-5fd21dec0538', 'admin'),
('c56a4180-65aa-42ec-a945-5fd21dec0539', 'instructor'),
('c56a4180-65aa-42ec-a945-5fd21dec053a', 'student');

-- Insert data into public.comment_flags
INSERT INTO public.comment_flags (comment_id, user_id, reason) VALUES
(1, 'c56a4180-65aa-42ec-a945-5fd21dec0538', 'Spam');

-- Insert data into public.comment_reactions
INSERT INTO public.comment_reactions (comment_id, user_id, reaction_type) VALUES
(1, 'c56a4180-65aa-42ec-a945-5fd21dec0538', 'like');

-- Insert data into public.plan_courses
INSERT INTO public.plan_courses (plan_id, course_id) VALUES
(1, 1);

-- Insert data into public.product_courses
INSERT INTO public.products (price, name) VALUES
(100.00, 'Product A'),
(150.00, 'Product B');

INSERT INTO public.product_courses (product_id, course_id) VALUES
(1, 1);

-- Insert data into public.distinct_exam_views
INSERT INTO public.exam_views (exam_id, user_id) VALUES
(1, 'c56a4180-65aa-42ec-a945-5fd21dec0538');

-- Insert data into public.distinct_lesson_views
INSERT INTO public.lesson_views (lesson_id, user_id) VALUES
(1, 'c56a4180-65aa-42ec-a945-5fd21dec0538');