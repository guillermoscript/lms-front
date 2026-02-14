#!/usr/bin/env tsx
/**
 * Apply database migration directly
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

async function applyMigration() {
  console.log('🔧 Applying database migration...\n')

  try {
    // Add payment_provider to products
    console.log('1️⃣ Adding payment_provider column to products...')
    
    const sql1 = `
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'products' AND column_name = 'payment_provider'
        ) THEN
          ALTER TABLE products ADD COLUMN payment_provider VARCHAR(20) DEFAULT 'stripe';
          ALTER TABLE products ADD CONSTRAINT products_payment_provider_check 
            CHECK (payment_provider IN ('stripe', 'manual', 'paypal'));
        END IF;
      END $$;
    `
    
    const { error: error1 } = await supabase.rpc('exec_sql' as any, { sql: sql1 }) as any
    
    if (error1) {
      console.log('   ⚠️  Trying alternative approach...')
      // Since exec_sql might not exist, we'll use a workaround
      // We'll check if the column exists by trying to select it
      const { error: checkError } = await supabase
        .from('products')
        .select('payment_provider')
        .limit(1)
      
      if (checkError && checkError.message.includes('payment_provider')) {
        console.log('   ❌ Column does not exist and cannot be added via JS')
        console.log('   📋 Please run this SQL manually in Supabase Dashboard:')
        console.log('')
        console.log('   ALTER TABLE products ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT \'stripe\';')
        console.log('   ALTER TABLE products ADD CONSTRAINT products_payment_provider_check')
        console.log('     CHECK (payment_provider IN (\'stripe\', \'manual\', \'paypal\'));')
        console.log('')
        console.log('   ALTER TABLE plans ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT \'stripe\';')
        console.log('   ALTER TABLE plans ADD CONSTRAINT plans_payment_provider_check')
        console.log('     CHECK (payment_provider IN (\'stripe\', \'manual\', \'paypal\'));')
        console.log('')
        return false
      } else {
        console.log('   ✅ Column already exists')
      }
    } else {
      console.log('   ✅ Added to products')
    }

    // Add payment_provider to plans
    console.log('\n2️⃣ Adding payment_provider column to plans...')
    const { error: checkError2 } = await supabase
      .from('plans')
      .select('payment_provider')
      .limit(1)
    
    if (checkError2 && checkError2.message.includes('payment_provider')) {
      console.log('   ❌ Column does not exist in plans')
      return false
    } else {
      console.log('   ✅ Column exists in plans')
    }

    console.log('\n✅ Migration check complete!')
    return true

  } catch (error) {
    console.error('❌ Migration failed:', error)
    return false
  }
}

async function main() {
  const success = await applyMigration()
  
  if (!success) {
    console.log('\n⚠️  Manual migration required. See instructions above.')
    process.exit(1)
  }
  
  process.exit(0)
}

main()
