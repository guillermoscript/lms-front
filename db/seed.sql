-- Insert data into auth.users for foreign key constraints
INSERT INTO auth.users (id, email) VALUES
('c56a4180-65aa-42ec-a945-5fd21dec0538', 'user1@example.com'),
('c56a4180-65aa-42ec-a945-5fd21dec0539', 'user2@example.com'),
('c56a4180-65aa-42ec-a945-5fd21dec053a', 'user3@example.com');

-- Insert data into public.course_categories
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

-- Insert data into public.exam_questions
INSERT INTO public.exams (course_id, title, description, exam_date, duration, status) VALUES
(1, 'Mid-term Exam', 'Covers the first half of the course', '2023-11-01 10:00:00+00', 120, 'draft'),
(3, 'Web Dev Exam I', 'Covers HTML and CSS', '2023-11-05 10:00:00+00', 90, 'published');

INSERT INTO public.exam_questions (exam_id, question_text, question_type) VALUES
(1, 'What is Newtons first law?', 'free_text'),
(1, 'Is the Earth flat?', 'true_false');

-- Insert data into public.subscriptions
INSERT INTO public.plans (plan_name, price, duration_in_days) VALUES
('Monthly Plan', 10.00, 30);


-- Insert data into public.roles
INSERT INTO public.roles (role_name) VALUES
('admin'),
('teacher'),
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

-- Insert data into public.plan_courses
INSERT INTO public.plan_courses (plan_id, course_id) VALUES
(1, 1);

-- Insert data into public.product_courses
INSERT INTO public.products (price, name) VALUES
(100.00, 'Product A'),
(150.00, 'Product B');

INSERT INTO public.product_courses (product_id, course_id) VALUES
(1, 1);
