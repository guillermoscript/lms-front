#!/usr/bin/env tsx
/**
 * Seed test data for purchase flow testing
 * Creates products with different payment methods and plans
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

async function seedPurchaseData() {
  console.log('🌱 Seeding purchase flow test data\n')

  try {
    // Get the existing course
    const { data: course } = await supabase
      .from('courses')
      .select('*')
      .eq('status', 'published')
      .single()

    if (!course) {
      console.error('❌ No published course found. Run seed-test-data.ts first')
      return
    }

    console.log(`✅ Found course: ${course.title}`)

    // Create manual payment product
    console.log('\n1️⃣ Creating manual payment product...')
    
    // Check if it exists first
    const { data: existingManual } = await supabase
      .from('products')
      .select('*')
      .eq('name', 'JavaScript Course - Bank Transfer')
      .maybeSingle()
    
    let manualProduct
    let manualError
    if (existingManual) {
      console.log('   ✅ Manual payment product already exists')
      manualProduct = existingManual
      manualError = null
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert({
          name: 'JavaScript Course - Bank Transfer',
          description: 'One-time purchase via bank transfer or offline payment',
          price: 49.99,
          currency: 'usd',
          status: 'active',
          payment_provider: 'manual'
        })
        .select()
        .single()
      
      manualProduct = data
      manualError = error
    }

    if (manualError) {
      console.error('   ❌ Error:', manualError.message)
      if (manualError.message.includes('payment_provider')) {
        console.log('\n   ⚠️  The payment_provider column doesn\'t exist yet!')
        console.log('      Please run this SQL in your Supabase dashboard:')
        console.log('')
        console.log('      ALTER TABLE products ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT \'stripe\';')
        console.log('      ALTER TABLE products ADD CONSTRAINT products_payment_provider_check')
        console.log('        CHECK (payment_provider IN (\'stripe\', \'manual\', \'paypal\'));')
        console.log('')
        return
      }
    } else {
      console.log(`   ✅ Created: ${manualProduct.name}`)

      // Link to course
      const { error: linkError } = await supabase
        .from('product_courses')
        .insert({
          product_id: manualProduct.product_id,
          course_id: course.course_id
        })

      if (linkError && !linkError.message.includes('duplicate')) {
        console.error('   ❌ Error linking product to course:', linkError.message)
      } else if (!linkError) {
        console.log('   ✅ Linked to course')
      }
    }

    // Create Stripe payment product
    console.log('\n2️⃣ Creating Stripe payment product...')
    
    const { data: existingStripe } = await supabase
      .from('products')
      .select('*')
      .eq('name', 'JavaScript Course - Credit Card')
      .maybeSingle()
    
    let stripeProduct
    let stripeError
    if (existingStripe) {
      console.log('   ✅ Stripe payment product already exists')
      stripeProduct = existingStripe
      stripeError = null
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert({
          name: 'JavaScript Course - Credit Card',
          description: 'One-time purchase via Stripe (Credit Card, Apple Pay, Google Pay)',
          price: 49.99,
          currency: 'usd',
          status: 'active',
          payment_provider: 'stripe'
        })
        .select()
        .single()
      
      stripeProduct = data
      stripeError = error
    }

    if (stripeError) {
      console.error('   ❌ Error:', stripeError.message)
    } else {
      console.log(`   ✅ Created: ${stripeProduct.name}`)

      // Link to course
      await supabase
        .from('product_courses')
        .insert({
          product_id: stripeProduct.product_id,
          course_id: course.course_id
        })
      console.log('   ✅ Linked to course')
    }

    // Create plans
    console.log('\n3️⃣ Creating subscription plans...')
    
    const plans = [
      {
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
        currency: 'usd',
        payment_provider: 'stripe'
      },
      {
        plan_name: 'Pro Yearly',
        price: 190.00,
        duration_in_days: 365,
        description: 'Yearly subscription - Save 20%!',
        features: JSON.stringify([
          'Access to all courses',
          'AI feedback on exams',
          'Certificates of completion',
          'Priority support',
          'Annual savings'
        ]),
        currency: 'usd',
        payment_provider: 'stripe'
      }
    ]

    for (const plan of plans) {
      const { data: existing } = await supabase
        .from('plans')
        .select('*')
        .eq('plan_name', plan.plan_name)
        .maybeSingle()
      
      if (existing) {
        console.log(`   ✅ Already exists: ${existing.plan_name} ($${existing.price}/${existing.duration_in_days === 30 ? 'mo' : 'yr'})`)
      } else {
        const { data: createdPlan, error: planError } = await supabase
          .from('plans')
          .insert(plan)
          .select()
          .single()

        if (planError) {
          console.error(`   ❌ Error creating ${plan.plan_name}:`, planError.message)
        } else {
          console.log(`   ✅ Created: ${createdPlan.plan_name} ($${createdPlan.price}/${createdPlan.duration_in_days === 30 ? 'mo' : 'yr'})`)
        }
      }
    }

    console.log('\n✅ Seeding complete!')
    console.log('\n📋 Test data created:')
    console.log('   - 2 products (manual + stripe payment)')
    console.log('   - 2 subscription plans (monthly + yearly)')
    console.log('   - All linked to JavaScript course')
    
  } catch (error) {
    console.error('❌ Seeding failed:', error)
  }
}

seedPurchaseData()
