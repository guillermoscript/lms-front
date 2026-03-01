import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// This is a development-only route to seed test data
export async function POST() {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  try {
    // Step 1: Get student user ID
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', 'student@test.com')
      .single()

    if (userError || !userData) {
      return NextResponse.json({ 
        error: 'User student@test.com not found. Please create the user first.',
        details: userError
      }, { status: 404 })
    }

    const studentUserId = userData.id
    console.log('Found student user ID:', studentUserId)

    // Step 2: Create test product for Course 1
    const { data: productData, error: productError } = await supabase
      .from('products')
      .upsert({
        name: 'JavaScript Fundamentals - One Time Purchase',
        description: 'Lifetime access to Introduction to JavaScript course',
        price: 29.99,
        product_type: 'one_time',
        status: 'active'
      }, {
        onConflict: 'name'
      })
      .select()
      .single()

    if (productError) {
      console.error('Product creation error:', productError)
      return NextResponse.json({ error: 'Failed to create product', details: productError }, { status: 500 })
    }

    const testProductId = productData.id
    console.log('Test product ID:', testProductId)

    // Step 3: Link product to Course 1
    await supabase
      .from('product_courses')
      .upsert({
        product_id: testProductId,
        course_id: 1
      }, {
        onConflict: 'product_id,course_id'
      })

    // Step 4: Create enrollments
    const enrollments = [
      {
        user_id: studentUserId,
        course_id: 1,
        product_id: testProductId,
        status: 'active',
        enrolled_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days ago
      },
      {
        user_id: studentUserId,
        course_id: 3,
        status: 'active',
        enrolled_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
      }
    ]

    for (const enrollment of enrollments) {
      const { error: enrollError } = await supabase
        .from('enrollments')
        .upsert(enrollment, {
          onConflict: 'user_id,course_id'
        })
      
      if (enrollError) {
        console.error('Enrollment error:', enrollError)
      }
    }

    console.log('Created enrollments for Courses 1 and 3')

    // Step 5: Add lesson completions
    const lessonCompletions = [
      // Course 1: 2 out of 3 lessons
      {
        student_id: studentUserId,
        lesson_id: 1,
        completed_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        student_id: studentUserId,
        lesson_id: 2,
        completed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      },
      // Course 3: 1 out of 24 lessons
      {
        student_id: studentUserId,
        lesson_id: 8,
        completed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      }
    ]

    for (const completion of lessonCompletions) {
      const { error: completionError } = await supabase
        .from('lesson_completions')
        .upsert(completion, {
          onConflict: 'student_id,lesson_id'
        })
      
      if (completionError) {
        console.error('Lesson completion error:', completionError)
      }
    }

    console.log('Created lesson completions')

    // Step 6: Create exam submission for Course 1
    const { data: submissionData, error: submissionError } = await supabase
      .from('exam_submissions')
      .insert({
        student_id: studentUserId,
        exam_id: 1,
        status: 'graded',
        submitted_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single()

    if (submissionError) {
      console.error('Exam submission error:', submissionError)
    } else {
      const submissionId = submissionData.id

      // Add exam answer
      await supabase
        .from('exam_answers')
        .insert({
          submission_id: submissionId,
          question_id: 1,
          selected_option_id: 3, // Correct answer
          is_correct: true,
          points_earned: 1.0
        })

      // Add exam score (60% - not passing)
      await supabase
        .from('exam_scores')
        .insert({
          submission_id: submissionId,
          score: 60.0,
          total_possible: 100.0,
          passed: false
        })

      console.log('Created exam submission with 60% score')
    }

    return NextResponse.json({
      success: true,
      message: 'Test data seeded successfully!',
      summary: {
        studentUserId,
        enrollments: 2,
        lessonCompletions: 3,
        examSubmissions: 1,
        expectedProgress: {
          course1: '~41% ((66.67% lessons + 0% exams) / 2)',
          course3: '~2% ((4.17% lessons + 0% exams) / 2)'
        }
      }
    })

  } catch (error) {
    console.error('Seeding error:', error)
    return NextResponse.json({ 
      error: 'Failed to seed data', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
