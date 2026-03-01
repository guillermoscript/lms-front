#!/usr/bin/env node

/**
 * Check Table Schemas
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function checkSchemas() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  console.log('📋 Checking table schemas...\n')

  // Check enrollments
  const { data: enrollments, error: e1 } = await supabase
    .from('enrollments')
    .select('*')
    .limit(1)

  console.log('Enrollments columns:', enrollments ? Object.keys(enrollments[0] || {}) : e1)

  // Check lesson_completions
  const { data: completions, error: e2 } = await supabase
    .from('lesson_completions')
    .select('*')
    .limit(1)

  console.log('Lesson_completions columns:', completions ? Object.keys(completions[0] || {}) : e2)

  // Check exam_submissions
  const { data: submissions, error: e3 } = await supabase
    .from('exam_submissions')
    .select('*')
    .limit(1)

  console.log('Exam_submissions columns:', submissions ? Object.keys(submissions[0] || {}) : e3)
}

checkSchemas()
