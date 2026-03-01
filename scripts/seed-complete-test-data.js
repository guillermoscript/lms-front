#!/usr/bin/env node

/**
 * Complete Test Data Seeding Script (WITH CORRECT SCHEMAS)
 * 
 * This script uses the ACTUAL database schema discovered via testing.
 * See docs/ACTUAL_SCHEMA.md for reference.
 * 
 * Run with: node scripts/seed-complete-test-data.js
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function seedCompleteTestData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  console.log('🌱 Starting COMPLETE test data seeding...\n')

  try {
    // ==================== STEP 1: Get student user ====================
    console.log('📋 Step 1: Finding student@test.com...')
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      console.error('❌ Error fetching users:', authError)
      process.exit(1)
    }

    const studentUser = users.find(u => u.email === 'student@test.com')
    if (!studentUser) {
      console.error('❌ User student@test.com not found')
      process.exit(1)
    }

    const studentUserId = studentUser.id
    console.log(`✅ Found user: ${studentUser.email} (${studentUserId})\n`)

    // ==================== STEP 2: Create product for Course 1 ====================
    console.log('📦 Step 2: Creating product for Course 1 (JavaScript)...')
    const { data: productData, error: productError } = await supabase
      .from('products')
      .insert({
        name: 'JavaScript Fundamentals - Lifetime Access',
        description: 'One-time purchase for Introduction to JavaScript course',
        price: 29.99,
        status: 'active'
      })
      .select()
      .single()

    let testProductId
    if (productError) {
      if (productError.code === '23505') {
        console.log('ℹ️  Product already exists, fetching...')
        const { data: existing } = await supabase
          .from('products')
          .select('product_id')
          .eq('name', 'JavaScript Fundamentals - Lifetime Access')
          .single()
        testProductId = existing?.product_id
      } else {
        throw productError
      }
    } else {
      testProductId = productData.product_id
    }
    console.log(`✅ Product ID: ${testProductId}`)

    // Link product to Course 1
    await supabase
      .from('product_courses')
      .upsert({ product_id: testProductId, course_id: 1 })
    console.log('✅ Product linked to Course 1\n')

    // ==================== STEP 3: Create plan & subscription for Course 3 ====================
    console.log('📋 Step 3: Creating plan and subscription for Course 3 (Inglés)...')
    
    // Create plan
    const { data: planData, error: planError } = await supabase
      .from('plans')
      .insert({
        plan_name: 'Basic Monthly - Test',
        description: 'Test subscription plan',
        price: 19.99,
        duration_in_days: 30,
        features: 'Access to all courses'
      })
      .select()
      .single()

    let testPlanId
    if (planError) {
      if (planError.code === '23505') {
        console.log('ℹ️  Plan already exists, fetching...')
        const { data: existing } = await supabase
          .from('plans')
          .select('plan_id')
          .eq('plan_name', 'Basic Monthly - Test')
          .single()
        testPlanId = existing?.plan_id
      } else {
        throw planError
      }
    } else {
      testPlanId = planData.plan_id
    }
    console.log(`✅ Plan ID: ${testPlanId}`)

    // Link plan to Course 3
    await supabase
      .from('plan_courses')
      .upsert({ plan_id: testPlanId, course_id: 3 })
    console.log('✅ Plan linked to Course 3')

    // Create subscription
    // First create a transaction
    const { data: transactionData, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        user_id: studentUserId,
        plan_id: testPlanId,
        amount: 19.99,
        status: 'successful',
        transaction_date: new Date().toISOString()
      })
      .select()
      .single()

    if (transactionError) {
      console.error('Transaction error:', transactionError)
      throw transactionError
    }
    
    const testTransactionId = transactionData.transaction_id
    console.log(`✅ Transaction ID: ${testTransactionId}`)

    // Now create subscription with transaction_id
    const { data: subData, error: subError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: studentUserId,
        plan_id: testPlanId,
        transaction_id: testTransactionId,
        subscription_status: 'active',
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single()

    let testSubscriptionId
    if (subError) {
      if (subError.code === '23505') {
        console.log('ℹ️  Subscription already exists, fetching...')
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('subscription_id')
          .eq('user_id', studentUserId)
          .eq('plan_id', testPlanId)
          .single()
        testSubscriptionId = existing?.subscription_id
      } else {
        console.error('Subscription error:', subError)
        throw subError
      }
    } else {
      testSubscriptionId = subData.subscription_id
    }
    console.log(`✅ Subscription ID: ${testSubscriptionId}\n`)

    // ==================== STEP 4: Create enrollments ====================
    console.log('🎓 Step 4: Creating enrollments...')
    
    // Enrollment 1: Course 1 (product-based - lifetime access)
    const { error: enroll1Error } = await supabase
      .from('enrollments')
      .upsert({
        user_id: studentUserId,
        course_id: 1,
        product_id: testProductId,
        status: 'active',
        enrollment_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      })
    
    if (enroll1Error && enroll1Error.code !== '23505') {
      console.error('Error creating enrollment 1:', enroll1Error)
    } else {
      console.log('  ✅ Enrolled in Course 1 (JavaScript) with product')
    }

    // Enrollment 2: Course 3 (subscription-based)
    const { error: enroll3Error } = await supabase
      .from('enrollments')
      .upsert({
        user_id: studentUserId,
        course_id: 3,
        subscription_id: testSubscriptionId,
        status: 'active',
        enrollment_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      })
    
    if (enroll3Error && enroll3Error.code !== '23505') {
      console.error('Error creating enrollment 3:', enroll3Error)
    } else {
      console.log('  ✅ Enrolled in Course 3 (Inglés) with subscription\n')
    }

    // ==================== STEP 5: Add lesson completions ====================
    console.log('📚 Step 5: Adding lesson completions...')
    
    const lessonCompletions = [
      { lesson_id: 1, days_ago: 6, course: 'JavaScript' },
      { lesson_id: 2, days_ago: 5, course: 'JavaScript' },
      { lesson_id: 8, days_ago: 2, course: 'Inglés' }
    ]

    for (const { lesson_id, days_ago, course } of lessonCompletions) {
      const { error } = await supabase
        .from('lesson_completions')
        .upsert({
          user_id: studentUserId,
          lesson_id,
          completed_at: new Date(Date.now() - days_ago * 24 * 60 * 60 * 1000).toISOString()
        })
      
      if (error && error.code !== '23505') {
        console.error(`  ❌ Error completing lesson ${lesson_id}:`, error.message)
      } else {
        console.log(`  ✅ Completed lesson ${lesson_id} (${course})`)
      }
    }
    console.log()

    // ==================== STEP 6: Add exam submission ====================
    console.log('📝 Step 6: Creating exam submission...')
    const { data: submissionData, error: submissionError } = await supabase
      .from('exam_submissions')
      .insert({
        student_id: studentUserId,
        exam_id: 1,
        score: 60.0,
        submission_date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        review_status: 'graded',
        requires_attention: false
      })
      .select()
      .single()

    if (submissionError) {
      if (submissionError.code === '23505') {
        console.log('  ℹ️  Exam submission already exists')
      } else {
        console.error('  ❌ Error creating submission:', submissionError.message)
      }
    } else {
      const submissionId = submissionData.submission_id
      console.log(`  ✅ Created submission ID: ${submissionId}`)
      console.log('  ✅ Added exam score: 60%\n')
    }

    // ==================== SUMMARY ====================
    console.log('═══════════════════════════════════════════════════════')
    console.log('✨ COMPLETE test data seeded successfully!\n')
    console.log('Student user:', studentUser.email)
    console.log('User ID:', studentUserId)
    console.log('\nEnrollments:')
    console.log('  • Course 1 (JavaScript): Product-based (lifetime access)')
    console.log('    - 2/3 lessons completed (66.67%)')
    console.log('    - 1 exam attempt (60% score, not passed)')
    console.log('    - Expected progress: ~33%')
    console.log('\n  • Course 3 (Inglés): Subscription-based (active)')
    console.log('    - 1/24 lessons completed (4.17%)')
    console.log('    - 0 exams attempted')
    console.log('    - Expected progress: ~2%')
    console.log('\nTest the My Courses page at:')
    console.log('  http://localhost:3000/dashboard/student/courses')
    console.log('═══════════════════════════════════════════════════════')

  } catch (error) {
    console.error('\n❌ Error seeding data:', error)
    process.exit(1)
  }
}

seedCompleteTestData()
