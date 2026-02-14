#!/usr/bin/env node

/**
 * Comprehensive Schema Discovery
 * Finds actual column names for all LMS tables
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function discoverSchemas() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  console.log('🔍 Discovering actual database schemas...\n')

  const tables = [
    'enrollments',
    'courses',
    'lessons',
    'lesson_completions',
    'exams',
    'exam_submissions',
    'exam_questions',
    'question_options',
    'products',
    'product_courses',
    'plans',
    'plan_courses',
    'subscriptions',
    'profiles'
  ]

  for (const table of tables) {
    try {
      // Try to get a single row to discover columns
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1)

      if (error) {
        console.log(`❌ ${table}:`, error.message)
        continue
      }

      const columns = data && data.length > 0 ? Object.keys(data[0]) : []
      
      if (columns.length > 0) {
        console.log(`✅ ${table}:`)
        console.log(`   Columns: ${columns.join(', ')}`)
        console.log()
      } else {
        // Table exists but is empty, try to infer from error message
        const { error: insertError } = await supabase
          .from(table)
          .insert({})
          .select()

        if (insertError) {
          // Extract column names from error message
          const match = insertError.message.match(/column[s]? "([^"]+)"/gi)
          if (match) {
            console.log(`📋 ${table} (empty, inferred):`)
            console.log(`   Mentioned columns: ${match.join(', ')}`)
            console.log()
          } else {
            console.log(`⚠️  ${table}: Empty table, couldn't infer schema`)
            console.log()
          }
        }
      }
    } catch (err) {
      console.log(`❌ ${table}:`, err.message)
    }
  }

  console.log('\n═══════════════════════════════════════════════════════')
  console.log('✨ Schema discovery complete!')
  console.log('═══════════════════════════════════════════════════════')
}

discoverSchemas()
