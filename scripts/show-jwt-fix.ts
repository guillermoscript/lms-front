#!/usr/bin/env tsx

import fs from 'fs'
import path from 'path'

async function applyJWTFix() {
  console.log('🔧 Applying JWT hook fix...')

  const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260214020000_complete_jwt_hook_fix.sql')
  const sql = fs.readFileSync(migrationPath, 'utf-8')

  console.log('\n📝 SQL to execute:')
  console.log('─'.repeat(60))
  console.log(sql)
  console.log('─'.repeat(60))

  console.log('\n⚠️  Automatic execution is not available.')
  console.log('\n📋 Please apply this fix manually:')
  console.log('\n1. Open Supabase Studio: \x1b[36mhttp://127.0.0.1:54323\x1b[0m')
  console.log('2. Navigate to: \x1b[36mSQL Editor\x1b[0m (in the left sidebar)')
  console.log('3. Click: \x1b[36m+ New query\x1b[0m')
  console.log('4. Copy the SQL above and paste it into the editor')
  console.log('5. Click: \x1b[36mRun\x1b[0m (or press Ctrl/Cmd + Enter)')
  console.log('\n✅ After running the SQL, try creating a new user - the error should be fixed!\n')
}

applyJWTFix()
