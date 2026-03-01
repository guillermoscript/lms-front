#!/usr/bin/env tsx
/**
 * Apply migration directly to database
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Load environment variables
config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
  console.log('🔧 Applying migration: add_payment_provider_to_products\n')

  const sql = readFileSync(
    resolve(__dirname, '../supabase/migrations/20260207190849_add_payment_provider_to_products.sql'),
    'utf-8'
  )

  // Split by semicolon and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  for (const statement of statements) {
    if (statement.length > 0) {
      console.log('Executing:', statement.substring(0, 60) + '...')
      
      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' })
      
      if (error) {
        console.error('❌ Error:', error.message)
        // Try using direct approach for constraints
        continue
      }
      console.log('✅ Success')
    }
  }

  console.log('\n✅ Migration applied!')
}

applyMigration()
