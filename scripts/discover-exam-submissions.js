#!/usr/bin/env node

/**
 * Discover exam_submissions schema by attempting insert
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function discoverExamSubmissions() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  console.log('🔍 Discovering exam_submissions schema...\n')

  // Try minimal insert to see what's required
  const { error } = await supabase
    .from('exam_submissions')
    .insert({})

  if (error) {
    console.log('Error message:', error.message)
    console.log('Error details:', error.details)
    console.log('Error hint:', error.hint)
    console.log('Error code:', error.code)
  }

  // Try with likely fields
  console.log('\nTrying with common fields...')
  const { error: error2 } = await supabase
    .from('exam_submissions')
    .insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      exam_id: 999
    })

  if (error2) {
    console.log('Error:', error2.message)
  }

  // Try getting any existing row to see structure
  console.log('\nChecking for existing submissions...')
  const { data, error: error3 } = await supabase
    .from('exam_submissions')
    .select('*')
    .limit(1)

  if (data && data.length > 0) {
    console.log('Found submission! Columns:', Object.keys(data[0]))
  } else {
    console.log('No submissions found')
  }
}

discoverExamSubmissions()
