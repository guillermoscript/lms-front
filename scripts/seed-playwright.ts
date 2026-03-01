/*
  scripts/seed-playwright.ts

  Minimal, idempotent Supabase seeding script for Playwright tests.
  - Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from environment
  - Creates: a published course "Playwright Test Course", 3 published lessons,
    1 exam with 1 multiple-choice question and options, a free product entry (best-effort),
    test student account playwright.student@example.com (Password123!), and an enrollment row.
  - The script is defensive and idempotent: it checks for existing rows and re-uses them.

  Usage (locally):
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ts-node scripts/seed-playwright.ts
  or (after compiling to JS):
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-playwright.js

  IMPORTANT: This script requires the Supabase service role key. Do NOT commit secrets.
*/

import { createClient } from '@supabase/supabase-js'

type MaybeRow<T> = T | null | undefined

const COURSE_TITLE = 'Playwright Test Course'
const STUDENT_EMAIL = 'playwright.student@example.com'
const STUDENT_PASSWORD = 'Password123!'

async function exitWithError(msg: string, code = 1): Promise<never> {
  console.error(msg)
  process.exit(code)
}

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    await exitWithError(
      'ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.'
    )
  }

  console.log('Connecting to Supabase...')
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    // keep sessions off for server/admin operations
    auth: { persistSession: false },
  })

  try {
    // 1) Ensure Course exists (idempotent)
    console.log(`Ensuring course: "${COURSE_TITLE}"`)
    const { data: existingCourse, error: selectCourseErr } = await supabase
      .from('courses')
      .select('*')
      .eq('title', COURSE_TITLE)
      .limit(1)
      .maybeSingle()

    if (selectCourseErr) {
      console.warn('Warning: error while reading courses table:', selectCourseErr.message)
    }

    let courseId: any = existingCourse?.id

    if (!courseId) {
      const insertPayload: any = {
        title: COURSE_TITLE,
        status: 'published',
        // best-effort fields; if columns do not exist they will be ignored by Supabase
        description: 'Course created for Playwright E2E tests',
        // if you have a boolean published column used, include it as well
        // published: true,
      }

      console.log('Creating new course...')
      const { data: createdCourse, error: insertCourseErr } = await supabase
        .from('courses')
        .insert(insertPayload)
        .select()
        .limit(1)
        .maybeSingle()

      if (insertCourseErr) {
        await exitWithError('Failed to create course: ' + insertCourseErr.message)
      }

      courseId = createdCourse?.id
      console.log('Created course id:', courseId)
    } else {
      console.log('Found existing course id:', courseId)
    }

    if (!courseId) await exitWithError('Cannot determine course id; aborting.')

    // 2) Ensure 3 lessons exist and are published and sequenced
    console.log('Ensuring 3 lessons for the course...')
    const lessonsToEnsure = [
      { sequence: 1, title: 'Lesson 1 — Intro', content: 'Lesson 1 content' },
      { sequence: 2, title: 'Lesson 2 — Practice', content: 'Lesson 2 content' },
      { sequence: 3, title: 'Lesson 3 — Wrap-up', content: 'Lesson 3 content' },
    ]

    for (const lesson of lessonsToEnsure) {
      // try to find by course_id and sequence
      const { data: foundLesson, error: foundErr } = await supabase
        .from('lessons')
        .select('*')
        .eq('course_id', courseId)
        .eq('sequence', lesson.sequence)
        .limit(1)
        .maybeSingle()

      if (foundErr) {
        console.warn('Warning reading lessons table:', foundErr.message)
      }

      if (foundLesson?.id) {
        console.log(`Found lesson seq=${lesson.sequence} id=${foundLesson.id}`)
        continue
      }

      const insertLesson: any = {
        course_id: courseId,
        title: lesson.title,
        sequence: lesson.sequence,
        status: 'published',
        content: lesson.content,
      }

      const { data: createdLesson, error: insertLessonErr } = await supabase
        .from('lessons')
        .insert(insertLesson)
        .select()
        .limit(1)
        .maybeSingle()

      if (insertLessonErr) {
        await exitWithError('Failed to insert lesson: ' + insertLessonErr.message)
      }

      console.log(`Created lesson seq=${lesson.sequence} id=${createdLesson?.id}`)
    }

    // 3) Ensure an exam exists for the course with one multiple-choice question
    console.log('Ensuring exam and question...')
    const EXAM_TITLE = 'Playwright Test Exam'
    const { data: existingExam } = await supabase
      .from('exams')
      .select('*')
      .eq('course_id', courseId)
      .eq('title', EXAM_TITLE)
      .limit(1)
      .maybeSingle()

    let examId: any = existingExam?.id

    if (!examId) {
      const { data: newExam, error: createExamErr } = await supabase
        .from('exams')
        .insert({ course_id: courseId, title: EXAM_TITLE, description: 'Test exam for Playwright' })
        .select()
        .limit(1)
        .maybeSingle()

      if (createExamErr) {
        await exitWithError('Failed to create exam: ' + createExamErr.message)
      }

      examId = newExam?.id
      console.log('Created exam id:', examId)
    } else {
      console.log('Found existing exam id:', examId)
    }

    if (!examId) await exitWithError('Cannot determine exam id; aborting.')

    // Check/create one question
    const QUESTION_PROMPT = 'What is 2 + 2?'
    const { data: existingQuestion } = await supabase
      .from('exam_questions')
      .select('*')
      .eq('exam_id', examId)
      .eq('prompt', QUESTION_PROMPT)
      .limit(1)
      .maybeSingle()

    let questionId: any = existingQuestion?.id

    if (!questionId) {
      const { data: createdQuestion, error: createQErr } = await supabase
        .from('exam_questions')
        .insert({ exam_id: examId, prompt: QUESTION_PROMPT, type: 'multiple_choice', sequence: 1 })
        .select()
        .limit(1)
        .maybeSingle()

      if (createQErr) {
        await exitWithError('Failed to create exam question: ' + createQErr.message)
      }

      questionId = createdQuestion?.id
      console.log('Created question id:', questionId)
    } else {
      console.log('Found existing question id:', questionId)
    }

    // Ensure question options (multiple choice) — create 4 options if missing
    if (!questionId) await exitWithError('Cannot determine question id; aborting.')

    const { data: existingOptions } = await supabase
      .from('question_options')
      .select('*')
      .eq('exam_question_id', questionId)

    if (!existingOptions || existingOptions.length < 4) {
      console.log('Creating question options (idempotent)...')
      // delete any existing options for a deterministic state, then re-insert
      const { error: delErr } = await supabase
        .from('question_options')
        .delete()
        .eq('exam_question_id', questionId)

      if (delErr) {
        console.warn('Warning deleting existing question options:', delErr.message)
      }

      const optionsToInsert = [
        { exam_question_id: questionId, text: '3', is_correct: false },
        { exam_question_id: questionId, text: '4', is_correct: true },
        { exam_question_id: questionId, text: '5', is_correct: false },
        { exam_question_id: questionId, text: '22', is_correct: false },
      ]

      const { error: insertOptionsErr } = await supabase.from('question_options').insert(optionsToInsert)

      if (insertOptionsErr) {
        await exitWithError('Failed to insert question options: ' + insertOptionsErr.message)
      }

      console.log('Inserted question options.')
    } else {
      console.log('Question options already exist (count=' + existingOptions.length + ')')
    }

    // 4) Create a free product (best-effort). Schema may vary: create a product row with price 0.
    console.log('Ensuring a free product (best-effort)...')
    try {
      const { data: existingProduct } = await supabase
        .from('products')
        .select('*')
        .eq('name', 'Playwright Test Product')
        .limit(1)
        .maybeSingle()

      if (!existingProduct?.id) {
        // best-effort: some installations use 'price' or 'unit_amount'
        const productPayload: any = {
          name: 'Playwright Test Product',
          active: true,
          // price 0 indicates free — field name may differ depending on schema
          price: 0,
          currency: 'USD',
          metadata: { purpose: 'playwright-seed' },
        }

        const { data: createdProduct, error: createProductErr } = await supabase
          .from('products')
          .insert(productPayload)
          .select()
          .limit(1)
          .maybeSingle()

        if (createProductErr) {
          console.warn('Could not create product (this environment may not have a products table):', createProductErr.message)
        } else {
          console.log('Created product id:', createdProduct?.id)
        }
      } else {
        console.log('Found existing product id:', existingProduct.id)
      }
    } catch (err: any) {
      console.warn('Skipped product creation; error:', err?.message ?? String(err))
    }

    // 5) Create or retrieve test student account
    console.log('Ensuring test student account:', STUDENT_EMAIL)
    let userId: string | null = null

    // Attempt: create user via admin API (service role key required)
    try {
      // The admin API is available in supabase-js as auth.admin
      // Note: depending on supabase-js version the API object shape may differ by minor version.
      // This call creates a user and confirms email.
      // If user already exists, we catch the error and try to find the user record.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const { data: newUser, error: createUserErr } = await (supabase.auth as any).admin.createUser({
        email: STUDENT_EMAIL,
        password: STUDENT_PASSWORD,
        email_confirm: true,
        // optional: set user_metadata or app_metadata if needed
      })

      if (createUserErr) {
        const msg = createUserErr.message ?? String(createUserErr)
        if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('user already exists')) {
          console.log('User already exists according to admin.createUser response; attempting to locate user id...')
        } else {
          // Some Supabase setups return an error; we still try to find user in profiles table
          console.warn('admin.createUser returned an error; continuing to lookup existing user:', msg)
        }
      }

      // supabase admin.createUser may return { id } or { user: { id } } depending on SDK/version
      const possibleId = (newUser as any)?.id ?? (newUser as any)?.user?.id ?? (newUser as any)?.user_id
      if (possibleId) {
        userId = possibleId
        console.log('Created user id:', userId)
      }
    } catch (err: any) {
      console.warn('admin.createUser threw an exception (continuing to attempt profile lookup):', err?.message ?? String(err))
    }

    // If admin.createUser did not provide id, try to find profile or auth.users by email
    if (!userId) {
      // Try to find in profiles table
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('email', STUDENT_EMAIL)
          .limit(1)
          .maybeSingle()

        if (profile?.id) {
          userId = profile.id
          console.log('Found user via profiles table id:', userId)
        }
      } catch (err: any) {
        console.warn('profiles lookup failed: ', err?.message ?? String(err))
      }
    }

    // Last-resort try: query auth.users using SQL via REST (service-role allowed)
    if (!userId) {
      try {
        const sql = `select id, email from auth.users where email = $1 limit 1;`
        const { data: rows, error: sqlErr } = await supabase.rpc('sql', { _q: sql, _params: [STUDENT_EMAIL] } as any)
        // NOTE: Many projects DO NOT expose a generic 'sql' RPC. If not available, skip.
        if (sqlErr) {
          // ignore
        } else if (Array.isArray(rows) && rows.length > 0) {
          // @ts-ignore
          userId = rows[0].id
          console.log('Found user via RPC SQL id:', userId)
        }
      } catch (err) {
        // ignore - not all setups have generic SQL RPC
      }
    }

    if (!userId) {
      console.warn(`Could not automatically determine user id for ${STUDENT_EMAIL}.`)
      console.warn('If the user already exists you may need to locate the id manually and create the enrollment.')
      console.warn('Attempting to proceed without user id (enrollment will fail if user missing).')
    }

    // Ensure profile exists (upsert into profiles) — some setups auto-create it on auth.user insert, but we upsert to be safe.
    if (userId) {
      try {
        const { data: prof, error: upsertProfErr } = await supabase
          .from('profiles')
          .upsert({ id: userId, email: STUDENT_EMAIL }, { onConflict: 'id' })
          .select()
          .limit(1)
          .maybeSingle()

        if (upsertProfErr) {
          console.warn('Warning upserting profile:', upsertProfErr.message)
        } else {
          console.log('Profiles upserted / confirmed for user id:', userId)
        }
      } catch (err: any) {
        console.warn('profiles upsert failed:', err?.message ?? String(err))
      }
    }

    // 6) Create enrollment row so the student can access the course (status active)
    if (userId) {
      console.log('Ensuring enrollment for student -> course')
      try {
        const { data: existingEnrollment } = await supabase
          .from('enrollments')
          .select('*')
          .eq('user_id', userId)
          .eq('course_id', courseId)
          .limit(1)
          .maybeSingle()

        if (existingEnrollment?.id) {
          console.log('Existing enrollment found id:', existingEnrollment.id)
        } else {
          const { data: createdEnroll, error: createEnrollErr } = await supabase
            .from('enrollments')
            .insert({ user_id: userId, course_id: courseId, status: 'active', enrolled_at: new Date().toISOString() })
            .select()
            .limit(1)
            .maybeSingle()

          if (createEnrollErr) {
            await exitWithError('Failed to create enrollment: ' + createEnrollErr.message)
          }

          console.log('Created enrollment id:', createdEnroll?.id)
        }
      } catch (err: any) {
        console.warn('Enrollment creation failed:', err?.message ?? String(err))
      }
    } else {
      console.warn('Skipping enrollment creation because user id was not determined.')
    }

    // 7) Ensure lesson_completions and exam_submissions are empty for the test student (clean state)
    console.log('Cleaning up any previous progress for the test student (fresh start)')
    if (userId) {
      try {
        const { error: delComErr } = await supabase
          .from('lesson_completions')
          .delete()
          .eq('user_id', userId)

        if (delComErr) console.warn('Warning deleting lesson_completions:', delComErr.message)

        const { error: delSubErr } = await supabase
          .from('exam_submissions')
          .delete()
          .eq('student_id', userId)
          .eq('exam_id', examId)

        if (delSubErr) console.warn('Warning deleting exam_submissions:', delSubErr.message)

        console.log('Progress rows removed (if any).')
      } catch (err: any) {
        console.warn('Cleanup operations failed:', err?.message ?? String(err))
      }
    } else {
      console.warn('Skipping progress cleanup because user id not found.')
    }

    console.log('\nSeeding finished. Summary:')
    console.log(`  Course: ${COURSE_TITLE} (id ${courseId})`)
    console.log('  Lessons: 3 (published, sequenced)')
    console.log(`  Exam: ${EXAM_TITLE} (id ${examId}) with 1 MC question`)
    console.log(`  Test student: ${STUDENT_EMAIL} (password: ${STUDENT_PASSWORD})`)
    if (userId) console.log('  Student id:', userId)
    console.log('  Enrollment: student -> course (active)')

    console.log('\nNotes:')
    console.log(' - If any step failed because a table does not exist in your schema (example: products table), the script logs a warning and continues.')
    console.log(' - This script requires a SUPABASE_SERVICE_ROLE_KEY with service_role permissions.')

    process.exit(0)
  } catch (err: any) {
    console.error('UNCAUGHT ERROR:', err?.message ?? String(err))
    process.exit(2)
  }
}

main()
