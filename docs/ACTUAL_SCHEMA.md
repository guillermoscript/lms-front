# Actual Database Schema Reference

This file contains the **actual** column names from the live database (discovered 2026-02-08).

## Core Tables

### `enrollments`
- enrollment_id (PK)
- user_id (FK → profiles.id)
- course_id (FK → courses.course_id)
- enrollment_date (timestamp)
- product_id (FK → products.product_id, nullable)
- subscription_id (FK → subscriptions.subscription_id, nullable)
- status (varchar)
- **Constraint**: Either product_id OR subscription_id must be set (not both null)

### `courses`
- course_id (PK)
- title
- description
- thumbnail_url
- author_id (FK → profiles.id)
- category_id (FK → course_categories.id)
- status (draft/published/archived)
- tags
- created_at
- updated_at
- published_at
- archived_at
- deleted_at

### `lessons`
- id (PK)
- course_id (FK → courses.course_id)
- sequence
- title
- content (MDX)
- description
- summary
- image
- video_url
- embed_code
- status (draft/published)
- ai_task_description
- ai_task_instructions
- created_at
- updated_at

### `lesson_completions`
- **user_id** (FK → profiles.id) - PRIMARY KEY COMPONENT
- lesson_id (FK → lessons.id) - PRIMARY KEY COMPONENT
- completed_at (timestamp)
- **Note**: Uses `user_id`, NOT `student_id`

### `exams`
- exam_id (PK)
- course_id (FK → courses.course_id)
- title
- description
- exam_date
- duration (minutes)
- sequence
- status (draft/published/archived)
- created_by (FK → profiles.id)
- created_at
- updated_at

### `exam_submissions`
- submission_id (PK)
- exam_id (FK → exams.exam_id)
- **student_id** (FK → profiles.id) - Note: Uses `student_id`, NOT `user_id`
- submission_date (timestamp)
- score (numeric, nullable)
- feedback (text, nullable)
- ai_data (jsonb, nullable)
- review_status (varchar - likely 'pending'/'graded'/'reviewed')
- requires_attention (boolean)
- ai_model_used (text, nullable)
- ai_processing_time_ms (integer, nullable)
- ai_confidence_score (numeric, nullable)

### `exam_questions`
- question_id (PK)
- exam_id (FK → exams.exam_id)
- question_text
- question_type (multiple_choice/true_false/free_text)
- ai_grading_criteria
- expected_keywords (array)
- max_length

### `question_options`
- option_id (PK)
- question_id (FK → exam_questions.question_id)
- option_text
- is_correct (boolean)

### `products`
- product_id (PK)
- name
- description
- price (numeric)
- currency
- image
- status (active/inactive)
- stripe_product_id
- stripe_price_id
- payment_provider
- created_at

### `product_courses`
- product_id (FK → products.product_id)
- course_id (FK → courses.course_id)
- **Primary Key**: (product_id, course_id)

### `plans`
- plan_id (PK)
- plan_name
- description
- price (numeric)
- currency
- duration_in_days
- features (text/array)
- thumbnail
- stripe_product_id
- stripe_price_id
- payment_provider
- created_at
- deleted_at

### `plan_courses`
- plan_id (FK → plans.plan_id)
- course_id (FK → courses.course_id)
- **Primary Key**: (plan_id, course_id)

### `subscriptions`
- subscription_id (PK)
- user_id (FK → profiles.id)
- plan_id (FK → plans.plan_id)
- subscription_status (active/cancelled/expired)
- transaction_id
- start_date
- end_date
- cancel_at
- canceled_at
- cancel_at_period_end
- trial_start
- trial_end
- created
- current_period_start
- current_period_end
- ended_at

### `profiles`
- id (PK, matches auth.users.id)
- username
- full_name
- avatar_url
- bio
- website
- currency_id
- stripe_customer_id
- stripeCustomerID (legacy?)
- data_person
- deactivated_at
- created_at

## Key Differences from Documentation

| Documented | Actual | Table |
|------------|--------|-------|
| id | enrollment_id | enrollments |
| enrolled_at | enrollment_date | enrollments |
| student_id | user_id | lesson_completions |
| id | product_id | products |
| id | plan_id | plans |
| id | exam_id | exams |
| id | course_id | courses (for foreign keys) |

## Foreign Key Patterns

When referencing courses: `courses.course_id`
When referencing lessons: `lessons.id`
When referencing products: `products.product_id`
When referencing plans: `plans.plan_id`
When referencing exams: `exams.exam_id`
When referencing users/students: `profiles.id` or just `user_id`
