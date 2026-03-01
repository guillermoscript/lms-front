#!/usr/bin/env tsx
/**
 * Add payment_provider column and seed test data
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function setup() {
  console.log('🔧 Setting up database for purchase flow testing\n')

  try {
    // Since we can't add columns via JS, let's just add products with manual payment
    // and update the existing product
    
    console.log('1️⃣ Creating test product with manual payment...')
    
    // Get the existing course
    const { data: course } = await supabase
      .from('courses')
      .select('*')
      .eq('status', 'published')
      .single()

    if (!course) {
      console.error('❌ No published course found')
      return
    }

    console.log(`   Found course: ${course.title}`)

    // Check if product already exists
    const { data: existingProduct } = await supabase
      .from('products')
      .select('*')
      .eq('name', 'JavaScript Course - Manual Payment')
      .maybeSingle()

    if (existingProduct) {
      console.log('   ✅ Manual payment product already exists')
    } else {
      // Note: We can't add the payment_provider column here
      // User will need to run the SQL migration manually via Supabase dashboard
      console.log('   ⚠️  Cannot create product with payment_provider column')
      console.log('      Please run this SQL in Supabase dashboard:')
      console.log('')
      console.log('      ALTER TABLE products ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT \'stripe\';')
      console.log('      ALTER TABLE products ADD CONSTRAINT products_payment_provider_check')
      console.log('        CHECK (payment_provider IN (\'stripe\', \'manual\', \'paypal\'));')
      console.log('')
    }

    // Create a plan for testing
    console.log('\n2️⃣ Creating test plan...')
    const { data: existingPlan } = await supabase
      .from('plans')
      .select('*')
      .eq('plan_name', 'Pro Monthly')
      .maybeSingle()

    if (existingPlan) {
      console.log('   ✅ Test plan already exists')
    } else {
      const { data: plan, error: planError } = await supabase
        .from('plans')
        .insert({
          plan_name: 'Pro Monthly',
          price: 19.00,
          duration_in_days: 30,
          description: 'Monthly subscription with access to all courses',
          features: JSON.stringify([
            'Access to all courses',
            'AI feedback on exams',
            'Certificates of completion',
            'Priority support'
          ]),
          currency: 'usd'
        })
        .select()
        .single()

      if (planError) {
        console.error('   ❌ Error creating plan:', planError.message)
      } else {
        console.log('   ✅ Created plan:', plan.plan_name)
      }
    }

    console.log('\n3️⃣ Verifying test student...')
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const testStudent = users.find(u => u.email === 'student@test.com')

    if (testStudent) {
      console.log('   ✅ Test student exists:', testStudent.email)
      console.log('   User ID:', testStudent.id)
    } else {
      console.log('   ❌ Test student not found')
      console.log('      Please run: npx tsx scripts/seed-test-data.ts')
    }

    console.log('\n✅ Setup complete!')
    console.log('\n📋 Next steps:')
    console.log('   1. Run the SQL migration in Supabase dashboard (see above)')
    console.log('   2. Then create manual payment product')
    console.log('   3. Test the purchase flow')
    
  } catch (error) {
    console.error('❌ Setup failed:', error)
  }
}

setup()
