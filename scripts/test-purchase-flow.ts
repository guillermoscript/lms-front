#!/usr/bin/env tsx
/**
 * Test script for purchase flow
 * Tests both product and plan purchases
 * 
 * Run with: npx tsx scripts/test-purchase-flow.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables!')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function testPurchaseFlow() {
  console.log('🧪 Testing Purchase Flow\n')

  try {
    // 1. Check if products table has payment_provider column
    console.log('1️⃣ Checking products table structure...')
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .limit(1)

    if (productsError) {
      console.error('❌ Products query failed:', productsError.message)
    } else if (products && products.length > 0) {
      const productFields = Object.keys(products[0])
      console.log('   Product fields:', productFields)
      
      if (!productFields.includes('payment_provider')) {
        console.log('   ⚠️  Missing: payment_provider column')
      } else {
        console.log('   ✅ Has payment_provider column')
      }
      
      if (!productFields.includes('status')) {
        console.log('   ⚠️  Missing: status column')
      } else {
        console.log('   ✅ Has status column')
      }
    }

    // 2. Check plans table
    console.log('\n2️⃣ Checking plans table...')
    const { data: plans, error: plansError } = await supabase
      .from('plans')
      .select('*')

    if (plansError) {
      console.error('❌ Plans query failed:', plansError.message)
    } else {
      console.log(`   ✅ Found ${plans?.length || 0} plans in database`)
      if (plans && plans.length > 0) {
        console.log('   Plans:', plans.map(p => `${p.plan_name} ($${p.price})`).join(', '))
      }
    }

    // 3. Check if we have test users
    console.log('\n3️⃣ Checking test users...')
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
    
    if (usersError) {
      console.error('❌ Users query failed:', usersError.message)
    } else {
      const testStudent = users.find(u => u.email === 'student@test.com')
      const testTeacher = users.find(u => u.email === 'teacher@test.com')
      
      if (testStudent) {
        console.log('   ✅ Test student exists:', testStudent.email)
      } else {
        console.log('   ⚠️  Test student not found')
      }
      
      if (testTeacher) {
        console.log('   ✅ Test teacher exists:', testTeacher.email)
      } else {
        console.log('   ⚠️  Test teacher not found')
      }
    }

    // 4. Check courses and enrollments
    console.log('\n4️⃣ Checking courses...')
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('*, lessons(count)')
      .eq('status', 'published')

    if (coursesError) {
      console.error('❌ Courses query failed:', coursesError.message)
    } else {
      console.log(`   ✅ Found ${courses?.length || 0} published courses`)
      if (courses && courses.length > 0) {
        courses.forEach(c => {
          console.log(`   - ${c.title} (${c.lessons?.[0]?.count || 0} lessons)`)
        })
      }
    }

    // 5. Check product_courses linkage
    console.log('\n5️⃣ Checking product-course linkage...')
    const { data: productCourses, error: pcError } = await supabase
      .from('product_courses')
      .select('*, product:products(name), course:courses(title)')

    if (pcError) {
      console.error('❌ Product-courses query failed:', pcError.message)
    } else {
      console.log(`   ✅ Found ${productCourses?.length || 0} product-course links`)
      if (productCourses && productCourses.length > 0) {
        productCourses.forEach(pc => {
          console.log(`   - Product "${pc.product?.name}" → Course "${pc.course?.title}"`)
        })
      }
    }

    // 6. Test enroll_user RPC function
    console.log('\n6️⃣ Testing enroll_user RPC function...')
    const testStudent = users.find(u => u.email === 'student@test.com')
    
    if (testStudent && products && products.length > 0) {
      // First, we need a transaction to exist for enroll_user to work
      console.log('   📝 Note: enroll_user requires a transaction record first')
      
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', testStudent.id)
        .eq('status', 'successful')
        .limit(1)
        .maybeSingle()

      if (transaction) {
        console.log('   ✅ Found existing successful transaction')
      } else {
        console.log('   ⚠️  No successful transaction found for test student')
        console.log('      This means enroll_user RPC will fail')
      }
    }

    console.log('\n✅ Test completed!')
    console.log('\n📋 Summary:')
    console.log('   - Review the output above to see what needs to be fixed')
    console.log('   - Missing payment_provider column will break product pages')
    console.log('   - Checkout flow needs transaction creation before enrollment')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

testPurchaseFlow()
