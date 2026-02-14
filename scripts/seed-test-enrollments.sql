-- Seed Test Enrollments and Progress for student@test.com
-- This script creates test data to verify the My Courses page functionality

-- Get student user ID (assuming student@test.com exists)
DO $$
DECLARE
  student_user_id uuid;
  test_product_id integer;
BEGIN
  -- Get student user ID
  SELECT id INTO student_user_id 
  FROM auth.users 
  WHERE email = 'student@test.com' 
  LIMIT 1;

  IF student_user_id IS NULL THEN
    RAISE NOTICE 'User student@test.com not found. Please create the user first.';
    RETURN;
  END IF;

  RAISE NOTICE 'Found student user ID: %', student_user_id;

  -- Create a test one-time purchase product for Course 1 (JavaScript)
  INSERT INTO products (name, description, price, product_type, status)
  VALUES (
    'JavaScript Fundamentals - One Time Purchase',
    'Lifetime access to Introduction to JavaScript course',
    29.99,
    'one_time',
    'active'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO test_product_id;

  -- If product already exists, get its ID
  IF test_product_id IS NULL THEN
    SELECT id INTO test_product_id
    FROM products
    WHERE name = 'JavaScript Fundamentals - One Time Purchase'
    LIMIT 1;
  END IF;

  RAISE NOTICE 'Test product ID: %', test_product_id;

  -- Link product to Course 1
  INSERT INTO product_courses (product_id, course_id)
  VALUES (test_product_id, 1)
  ON CONFLICT (product_id, course_id) DO NOTHING;

  -- Create enrollment for Course 1 (product-based - lifetime access)
  INSERT INTO enrollments (user_id, course_id, product_id, status, enrolled_at)
  VALUES (student_user_id, 1, test_product_id, 'active', NOW() - INTERVAL '7 days')
  ON CONFLICT (user_id, course_id) DO NOTHING;

  RAISE NOTICE 'Created enrollment for Course 1 (JavaScript) with product_id';

  -- Create enrollment for Course 3 (Inglés) - subscription-based (simulated)
  -- NOTE: We're not creating a real subscription here, just an enrollment
  -- In production, this would be linked to a subscription_id
  INSERT INTO enrollments (user_id, course_id, status, enrolled_at)
  VALUES (student_user_id, 3, 'active', NOW() - INTERVAL '3 days')
  ON CONFLICT (user_id, course_id) DO NOTHING;

  RAISE NOTICE 'Created enrollment for Course 3 (Inglés) without product (subscription simulation)';

  -- Add lesson completions for Course 1 (2 out of 3 lessons completed)
  -- Lesson 1: Completed
  INSERT INTO lesson_completions (student_id, lesson_id, completed_at)
  VALUES (student_user_id, 1, NOW() - INTERVAL '6 days')
  ON CONFLICT (student_id, lesson_id) DO NOTHING;

  -- Lesson 2: Completed
  INSERT INTO lesson_completions (student_id, lesson_id, completed_at)
  VALUES (student_user_id, 2, NOW() - INTERVAL '5 days')
  ON CONFLICT (student_id, lesson_id) DO NOTHING;

  -- Lesson 3: Not completed (to show "In Progress" status)

  RAISE NOTICE 'Created 2/3 lesson completions for Course 1';

  -- Add lesson completion for Course 3 (1 out of 24 lessons completed)
  INSERT INTO lesson_completions (student_id, lesson_id, completed_at)
  VALUES (student_user_id, 8, NOW() - INTERVAL '2 days')
  ON CONFLICT (student_id, lesson_id) DO NOTHING;

  RAISE NOTICE 'Created 1/24 lesson completion for Course 3';

  -- Add exam submission for Course 1 (JavaScript Fundamentals Quiz)
  -- First attempt: 60% (not passed if passing score is 70%)
  INSERT INTO exam_submissions (student_id, exam_id, status, submitted_at)
  VALUES (student_user_id, 1, 'graded', NOW() - INTERVAL '4 days')
  ON CONFLICT DO NOTHING;

  -- Get the submission ID to add answers and score
  WITH latest_submission AS (
    SELECT id FROM exam_submissions 
    WHERE student_id = student_user_id AND exam_id = 1 
    ORDER BY submitted_at DESC 
    LIMIT 1
  )
  INSERT INTO exam_answers (submission_id, question_id, answer_text, selected_option_id, is_correct, points_earned)
  SELECT 
    ls.id,
    1, -- Question 1 (multiple choice)
    NULL,
    3, -- Correct answer (const)
    true,
    1.0
  FROM latest_submission ls
  ON CONFLICT DO NOTHING;

  -- Add score for this submission
  WITH latest_submission AS (
    SELECT id FROM exam_submissions 
    WHERE student_id = student_user_id AND exam_id = 1 
    ORDER BY submitted_at DESC 
    LIMIT 1
  )
  INSERT INTO exam_scores (submission_id, score, total_possible, passed)
  SELECT ls.id, 60.0, 100.0, false
  FROM latest_submission ls
  ON CONFLICT (submission_id) DO NOTHING;

  RAISE NOTICE 'Created exam submission with 60%% score for Course 1';

  RAISE NOTICE 'Test data seeded successfully!';
  RAISE NOTICE 'Student user has:';
  RAISE NOTICE '  - Course 1 (JavaScript): 2/3 lessons complete, 0/1 exams passed (60%% score)';
  RAISE NOTICE '  - Course 3 (Inglés): 1/24 lessons complete, 0/1 exams attempted';
  RAISE NOTICE 'Expected progress:';
  RAISE NOTICE '  - Course 1: ~41%% progress ((66.67%% lessons + 0%% exams) / 2)';
  RAISE NOTICE '  - Course 3: ~2%% progress ((4.17%% lessons + 0%% exams) / 2)';

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error occurred: %', SQLERRM;
    RAISE;
END $$;
