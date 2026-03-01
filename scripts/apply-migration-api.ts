#!/usr/bin/env tsx
/**
 * Apply migration using Supabase Management API
 * This will execute SQL directly on the database
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// Load environment variables
config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function executeSql(sql: string) {
  // Extract project reference from URL
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1]
  
  if (!projectRef) {
    console.error('Could not extract project reference from URL')
    return false
  }

  console.log(`Project: ${projectRef}`)
  
  const query = `
    ALTER TABLE products ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT 'stripe';
    
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_payment_provider_check'
      ) THEN
        ALTER TABLE products ADD CONSTRAINT products_payment_provider_check 
          CHECK (payment_provider IN ('stripe', 'manual', 'paypal'));
      END IF;
    END $$;
    
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT 'stripe';
    
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'plans_payment_provider_check'
      ) THEN
        ALTER TABLE plans ADD CONSTRAINT plans_payment_provider_check 
          CHECK (payment_provider IN ('stripe', 'manual', 'paypal'));
      END IF;
    END $$;
  `

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({ query })
    })

    if (!response.ok) {
      console.log('API approach failed, trying direct SQL execution...')
      
      // Try using the pg_net extension if available
      const sqlResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ sql: query })
      })

      if (!sqlResponse.ok) {
        const error = await sqlResponse.text()
        console.error('❌ SQL execution failed:', error)
        return false
      }
    }

    console.log('✅ Migration applied successfully')
    return true

  } catch (error) {
    console.error('❌ Error:', error)
    return false
  }
}

async function main() {
  console.log('🔧 Attempting to apply migration via API...\n')
  
  const success = await executeSql('')
  
  if (!success) {
    console.log('\n📋 Manual approach required:')
    console.log('1. Go to: https://supabase.com/dashboard/project/_/sql')
    console.log('2. Paste and run:')
    console.log('')
    console.log(readFileSync(resolve(__dirname, '../supabase/migrations/20260207190849_add_payment_provider_to_products.sql'), 'utf-8'))
  }
}

main()
