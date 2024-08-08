### Level 0: No Dependencies
1. `course_categories`
2. `products`
3. `plans`
4. `permissions`
5. `roles`

### Level 1: Direct Dependencies on Level 0
1. `courses` (depends on `course_categories`)
2. `profiles` (depends on `auth.users` but included here as `auth.users` is not detailed)
3. `plan_courses` (depends on `plans` and `courses`)
4. `product_courses` (depends on `products` and `courses`)

### Level 2: Dependencies on Level 1
1. `assignments` (depends on `courses`)
2. `exams` (depends on `courses` and `auth.users`)
3. `lessons` (depends on `courses`)
4. `reviews` (depends on `auth.users`)
5. `user_roles` (depends on `auth.users`)
6. `enrollments` (depends on `courses`, `subscriptions`, `products`, and `auth.users`)
7. `subscriptions` (depends on `plans`, `transactions`, `auth.users`)

### Level 3: Dependencies on Level 2
1. `exam_questions` (depends on `exams`)
2. `exam_submissions` (depends on `exams` and `auth.users`)
3. `grades` (depends on `courses`, `exam_submissions`, and `auth.users`)
4. `exam_views` (depends on `exams` and `auth.users`)
5. `lesson_comments` (depends on `lessons` and `profiles`)
6. `lesson_completions` (depends on `lessons` and `profiles`)
7. `lesson_passed` (depends on `lessons` and `auth.users`)
8. `lesson_views` (depends on `lessons` and `auth.users`)
9. `lessons_ai_task_messages` (depends on `lessons` and `auth.users`)
10. `lessons_ai_tasks` (depends on `lessons`)

### Level 4: Dependencies on Level 3
1. `exam_answers` (depends on `exam_questions` and `exam_submissions`)
2. `exam_scores` (depends on `exams`, `exam_submissions`, and `auth.users`)

### Level 5: Dependencies on Level 4
1. `question_options` (depends on `exam_questions`)

### Level 6: Miscellaneous Tables
1. `comment_flags` (depends on `lesson_comments` and `profiles`)
2. `comment_reactions` (depends on `lesson_comments` and `profiles`)
3. `chats` (depends on `auth.users`)
4. `messages` (depends on `chats`)
5. `notifications` (depends on `auth.users`)
6. `role_permissions` (depends on `permissions` and `roles`)
7. `submissions` (depends on `assignments` and `auth.users`)
8. `transactions` (depends on `auth.users`)
