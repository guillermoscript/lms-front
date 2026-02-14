#!/usr/bin/env node

/**
 * Check Users Script
 * Checks what users exist in the system
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function checkUsers() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  console.log('👥 Checking users...\n')

  // Check profiles
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, created_at')
    .limit(10)

  console.log('Profiles table:')
  if (profileError) {
    console.error('Error:', profileError)
  } else if (profiles.length === 0) {
    console.log('  (No profiles found)')
  } else {
    profiles.forEach(p => {
      console.log(`  • ${p.email} - ${p.full_name || '(no name)'} - ID: ${p.id}`)
    })
  }

  console.log()

  // Check auth users (requires admin API)
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers()

  console.log('Auth users:')
  if (authError) {
    console.error('Error:', authError)
  } else if (users.length === 0) {
    console.log('  (No users found)')
  } else {
    users.forEach(u => {
      console.log(`  • ${u.email} - ID: ${u.id}`)
    })
  }
}

checkUsers()
