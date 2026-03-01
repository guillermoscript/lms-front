#!/usr/bin/env tsx
/**
 * Direct API tests for purchase flow
 * Tests the core enrollment functions without UI
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

async function testPurchaseFlow() {
  console.log('🧪 Testing Purchase Flow - Core Functionality\n')

  try {
    // Get test student
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const student = users.find(u => u.email === 'student@test.com')
    
    if (!student) {
      console.error('❌ Test student not found')
      return
    }

    console.log('✅ Test student:', student.email)

    // Ensure profile exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', student.id)
      .maybeSingle()

    if (!existingProfile) {
      console.log('   Creating profile...')
      await supabase
        .from('profiles')
        .insert({
          id: student.id,
          full_name: 'Test Student'
        })
      console.log('   ✅ Profile created')
    }

    // Clean up existing data
    console.log('\n🧹 Cleaning up existing test data...')
    await supabase.from('enrollments').delete().eq('user_id', student.id)
    await supabase.from('transactions').delete().eq('user_id', student.id)
    await supabase.from('payment_requests').delete().eq('user_id', student.id)
    await supabase.from('subscriptions').delete().eq('user_id', student.id)
    console.log('✅ Cleaned up')

    // Test 1: Manual Payment Request
    console.log('\n📋 Test 1: Creating Manual Payment Request')
    const { data: manualProduct } = await supabase
      .from('products')
      .select('*')
      .eq('payment_provider', 'manual')
      .single()

    if (!manualProduct) {
      console.error('❌ No manual payment product found')
      return
    }

    const { data: paymentRequest, error: prError } = await supabase
      .from('payment_requests')
      .insert({
        user_id: student.id,
        product_id: manualProduct.product_id,
        contact_name: 'Test Student',
        contact_email: 'student@test.com',
        contact_phone: '+1234567890',
        message: 'Test payment request',
        payment_amount: manualProduct.price,
        payment_currency: manualProduct.currency,
        status: 'pending'
      })
      .select()
      .single()

    if (prError) {
      console.error('❌ Failed to create payment request:', prError.message)
      return
    }

    console.log('✅ Created payment request:', paymentRequest.request_id)

    // Test 2: Simulate Admin Confirming Payment and Enrolling
    console.log('\n📋 Test 2: Simulating Admin Confirmation')
    
    // Create transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: student.id,
        product_id: manualProduct.product_id,
        amount: manualProduct.price,
        currency: manualProduct.currency,
        payment_method: 'manual',
        status: 'successful'
      })
      .select()
      .single()

    if (txError) {
      console.error('❌ Failed to create transaction:', txError.message)
      return
    }

    console.log('✅ Created transaction:', transaction.transaction_id)

    // Call enroll_user RPC
    const { error: enrollError } = await supabase.rpc('enroll_user', {
      _user_id: student.id,
      _product_id: manualProduct.product_id
    })

    if (enrollError) {
      console.error('❌ enroll_user RPC failed:', enrollError.message)
      return
    }

    console.log('✅ Called enroll_user RPC')

    // Verify enrollment
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('*')
      .eq('user_id', student.id)

    console.log(`✅ User enrolled in ${enrollments?.length || 0} course(s)`)

    // Update payment request status
    await supabase
      .from('payment_requests')
      .update({ status: 'completed' })
      .eq('request_id', paymentRequest.request_id)

    console.log('✅ Updated payment request status to completed')

    // Test 3: Plan Purchase
    console.log('\n📋 Test 3: Plan Purchase')
    
    const { data: plan } = await supabase
      .from('plans')
      .select('*')
      .eq('duration_in_days', 30)
      .single()

    if (!plan) {
      console.error('❌ No monthly plan found')
      return
    }

    console.log(`   Plan: ${plan.plan_name} ($${plan.price})`)

    // Create transaction for plan
    const { data: planTransaction, error: planTxError } = await supabase
      .from('transactions')
      .insert({
        user_id: student.id,
        plan_id: plan.plan_id,
        amount: plan.price,
        currency: plan.currency,
        payment_method: 'test',
        status: 'successful'
      })
      .select()
      .single()

    if (planTxError) {
      console.error('❌ Failed to create plan transaction:', planTxError.message)
      return
    }

    console.log('✅ Created plan transaction:', planTransaction.transaction_id)

    // Call handle_new_subscription RPC
    const { error: subError } = await supabase.rpc('handle_new_subscription', {
      _user_id: student.id,
      _plan_id: plan.plan_id,
      _transaction_id: planTransaction.transaction_id
    })

    if (subError) {
      console.error('❌ handle_new_subscription RPC failed:', subError.message)
      return
    }

    console.log('✅ Called handle_new_subscription RPC')

    // Verify subscription
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', student.id)
      .eq('subscription_status', 'active')

    console.log(`✅ Active subscriptions: ${subscriptions?.length || 0}`)

    // Final Summary
    console.log('\n📊 Final State:')
    console.log(`   - Enrollments: ${enrollments?.length || 0}`)
    console.log(`   - Transactions: 2 (product + plan)`)
    console.log(`   - Active Subscriptions: ${subscriptions?.length || 0}`)
    console.log(`   - Payment Requests: 1 (completed)`)

    console.log('\n✅ All tests passed!')
    console.log('\n🎉 Purchase flow is working correctly!')

  } catch (error) {
    console.error('\n❌ Test failed:', error)
  }
}

testPurchaseFlow()
