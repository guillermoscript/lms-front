#!/usr/bin/env node

/**
 * Verify Test Data
 * Quick check to verify all test data exists in the database
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function verifyTestData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  const studentUserId = '712c392f-689d-4075-9e5e-8008a9e1a999'

  console.log('🔍 Verifying test data for student@test.com...\n')

  // Check enrollments
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('enrollment_id, course_id, product_id, subscription_id, status')
    .eq('user_id', studentUserId)

  console.log('📚 Enrollments:', enrollments?.length || 0)
  enrollments?.forEach(e => {
    console.log(`  - Course ${e.course_id}: ${e.product_id ? 'Product-based' : 'Subscription-based'} (${e.status})`)
  })

  // Check lesson completions
  const { data: completions } = await supabase
    .from('lesson_completions')
    .select('lesson_id, completed_at')
    .eq('user_id', studentUserId)

  console.log(`\n📖 Lesson Completions: ${completions?.length || 0}`)
  completions?.forEach(c => {
    console.log(`  - Lesson ${c.lesson_id}`)
  })

  // Check exam submissions
  const { data: submissions } = await supabase
    .from('exam_submissions')
    .select('submission_id, exam_id, score')
    .eq('student_id', studentUserId)

  console.log(`\n📝 Exam Submissions: ${submissions?.length || 0}`)
  submissions?.forEach(s => {
    console.log(`  - Exam ${s.exam_id}: ${s.score}%`)
  })

  // Check subscriptions
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('subscription_id, subscription_status, start_date, end_date')
    .eq('user_id', studentUserId)

  console.log(`\n💳 Subscriptions: ${subscriptions?.length || 0}`)
  subscriptions?.forEach(s => {
    const endDate = new Date(s.end_date)
    const isActive = endDate > new Date()
    console.log(`  - ID ${s.subscription_id}: ${s.subscription_status} (${isActive ? 'Valid' : 'Expired'})`)
  })

  // Summary
  console.log('\n═══════════════════════════════════════════════════════')
  const hasData = (enrollments?.length || 0) > 0 && 
                  (completions?.length || 0) > 0 &&
                  (submissions?.length || 0) > 0

  if (hasData) {
    console.log('✅ Test data verification PASSED!')
    console.log('\nReady to test My Courses page:')
    console.log('  http://localhost:3000/dashboard/student/courses')
  } else {
    console.log('❌ Test data verification FAILED!')
    console.log('\nRun the seed script:')
    console.log('  node scripts/seed-complete-test-data.js')
  }
  console.log('═══════════════════════════════════════════════════════')
}

verifyTestData()
