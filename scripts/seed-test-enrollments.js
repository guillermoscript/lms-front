#!/usr/bin/env node

/**
 * Seed Test Enrollments Script
 * 
 * Run with: node scripts/seed-test-enrollments.js
 * 
 * This script creates test data for student@test.com to test the My Courses page
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function seedTestData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables')
    console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  console.log('🌱 Starting test data seeding...\n')

  try {
    // Step 1: Get student user ID from auth
    console.log('📋 Step 1: Finding student@test.com...')
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      console.error('❌ Error fetching users:', authError)
      process.exit(1)
    }

    const studentUser = users.find(u => u.email === 'student@test.com')
    if (!studentUser) {
      console.error('❌ User student@test.com not found')
      console.error('Please create the user first')
      process.exit(1)
    }

    const studentUserId = studentUser.id
    console.log(`✅ Found user: ${studentUser.email} (${studentUserId})\n`)

    // Step 2: Create test product
    console.log('📦 Step 2: Creating test product...')
    const { data: productData, error: productError } = await supabase
      .from('products')
      .insert({
        name: 'JavaScript Fundamentals - One Time Purchase',
        description: 'Lifetime access to Introduction to JavaScript course',
        price: 29.99,
        status: 'active'
      })
      .select()
      .single()

    let testProductId
    if (productError) {
      if (productError.code === '23505') {
        // Product already exists, fetch it
        console.log('ℹ️  Product already exists, fetching...')
        const { data: existingProduct, error: fetchError } = await supabase
          .from('products')
          .select('product_id')
          .eq('name', 'JavaScript Fundamentals - One Time Purchase')
          .single()
        
        if (fetchError || !existingProduct) {
          throw fetchError || new Error('Product not found after duplicate error')
        }
        testProductId = existingProduct.product_id
      } else {
        throw productError
      }
    } else {
      testProductId = productData.product_id
    }
    
    if (!testProductId) {
      throw new Error('Failed to get product ID')
    }
    
    console.log(`✅ Product ID: ${testProductId}\n`)

    // Step 3: Link product to Course 1
    console.log('🔗 Step 3: Linking product to Course 1...')
    const { error: linkError } = await supabase
      .from('product_courses')
      .upsert({
        product_id: testProductId,
        course_id: 1
      })
    
    if (linkError && linkError.code !== '23505') {
      throw linkError
    }
    console.log('✅ Product linked to Course 1\n')

    // Step 4: Create enrollments
    console.log('🎓 Step 4: Creating enrollments...')
    
    // Enrollment 1: Course 1 (product-based)
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

    // Enrollment 2: Course 3 (subscription simulation)
    const { error: enroll3Error } = await supabase
      .from('enrollments')
      .upsert({
        user_id: studentUserId,
        course_id: 3,
        status: 'active',
        enrollment_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      })
    
    if (enroll3Error && enroll3Error.code !== '23505') {
      console.error('Error creating enrollment 3:', enroll3Error)
    } else {
      console.log('  ✅ Enrolled in Course 3 (Inglés) without product\n')
    }

    // Step 5: Add lesson completions
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
          student_id: studentUserId,
          lesson_id,
          completed_at: new Date(Date.now() - days_ago * 24 * 60 * 60 * 1000).toISOString()
        })
      
      if (error && error.code !== '23505') {
        console.error(`Error completing lesson ${lesson_id}:`, error)
      } else {
        console.log(`  ✅ Completed lesson ${lesson_id} (${course})`)
      }
    }
    console.log()

    // Step 6: Create exam submission
    console.log('📝 Step 6: Creating exam submission...')
    const { data: submissionData, error: submissionError } = await supabase
      .from('exam_submissions')
      .insert({
        student_id: studentUserId,
        exam_id: 1,
        answers: {},
        score: 60.0,
        submitted_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single()

    if (submissionError) {
      console.error('Error creating submission:', submissionError)
    } else {
      const submissionId = submissionData.id || submissionData.submission_id
      console.log(`  ✅ Created submission ID: ${submissionId}`)
      console.log('  ✅ Added exam score: 60%\n')
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════')
    console.log('✨ Test data seeded successfully!\n')
    console.log('Student user:', studentUser.email)
    console.log('User ID:', studentUserId)
    console.log('\nEnrollments:')
    console.log('  • Course 1 (JavaScript): 2/3 lessons, 1 exam attempt (60%)')
    console.log('  • Course 3 (Inglés): 1/24 lessons, 0 exams\n')
    console.log('Expected Progress:')
    console.log('  • Course 1: ~33% progress ((66.67% lessons + 0% exams) / 2)')
    console.log('  • Course 3: ~2% progress ((4.17% lessons + 0% exams) / 2)\n')
    console.log('Test the My Courses page at:')
    console.log('  http://localhost:3000/dashboard/student/courses')
    console.log('═══════════════════════════════════════════════════════')

  } catch (error) {
    console.error('\n❌ Error seeding data:', error)
    process.exit(1)
  }
}

seedTestData()
