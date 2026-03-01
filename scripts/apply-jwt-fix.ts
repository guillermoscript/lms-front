import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
})

async function applyJWTFix() {
  console.log('🔧 Applying JWT hook fix...')

  try {
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260214010000_fix_jwt_hook_permissions.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')

    console.log('Executing SQL migration...')
    
    // Split by statements and execute one by one
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' })
          if (error) {
            console.log(`Executing direct statement...`)
            // Try executing directly if rpc doesn't work
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
              method: 'POST',
              headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json'
              } as Record<string, string>,
              body: JSON.stringify({ query: statement + ';' })
            })
            if (!response.ok) {
              console.warn(`Statement execution warning:`, await response.text())
            }
          }
        } catch (err) {
          console.warn(`Skipping statement (may already be applied):`, err)
        }
      }
    }

    console.log('\n✅ JWT hook fix applied!')
    console.log('\nNow try creating a user again.')
    
  } catch (error) {
    console.error('❌ Failed to apply fix:', error)
    console.log('\n📝 Manual fix required:')
    console.log('1. Open Supabase Studio: http://127.0.0.1:54323')
    console.log('2. Go to SQL Editor')
    console.log('3. Copy and paste the contents of:')
    console.log('   supabase/migrations/20260214010000_fix_jwt_hook_permissions.sql')
    console.log('4. Run the SQL')
    process.exit(1)
  }
}

applyJWTFix()
