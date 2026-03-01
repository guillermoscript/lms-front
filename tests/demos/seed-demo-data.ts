/**
 * Demo Seed Runner
 * Executes seed-demo-data.sql against the Supabase database.
 *
 * Usage: npx tsx tests/demos/seed-demo-data.ts
 *        npm run demo:seed
 *
 * Tries (in order):
 *   1. psql (if installed) via DATABASE_URL or local default
 *   2. docker exec psql inside the local Supabase postgres container
 */

import { execSync } from 'child_process'
import { resolve } from 'path'

const sqlPath = resolve(__dirname, 'seed-demo-data.sql')

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const dbUrl = process.env.DATABASE_URL || LOCAL_DB_URL

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function findSupabaseDbContainer(): string | null {
  try {
    const containers = execSync(
      'docker ps --format "{{.Names}}" 2>/dev/null',
      { encoding: 'utf-8' }
    )
    const match = containers.split('\n').find(name => name.includes('supabase_db'))
    return match?.trim() || null
  } catch {
    return null
  }
}

function main() {
  console.log('Applying demo seed data...')
  console.log(`  SQL file: ${sqlPath}`)

  // Method 1: native psql
  if (hasCommand('psql')) {
    console.log(`  Method: psql → ${dbUrl.replace(/:[^@]*@/, ':***@')}`)
    try {
      const output = execSync(`psql "${dbUrl}" -f "${sqlPath}" 2>&1`, {
        encoding: 'utf-8',
        timeout: 30_000,
      })
      console.log(output)
      console.log('Demo seed data applied successfully!')
      return
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string }
      console.error('psql failed:')
      if (error.stdout) console.error(error.stdout)
      if (error.stderr) console.error(error.stderr)
      process.exit(1)
    }
  }

  // Method 2: docker exec into Supabase postgres container
  const container = findSupabaseDbContainer()
  if (container) {
    console.log(`  Method: docker exec ${container}`)
    try {
      const output = execSync(
        `docker exec -i ${container} psql -U postgres -d postgres`,
        {
          input: require('fs').readFileSync(sqlPath, 'utf-8'),
          encoding: 'utf-8',
          timeout: 30_000,
        }
      )
      console.log(output)
      console.log('Demo seed data applied successfully!')
      return
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string }
      console.error('docker exec psql failed:')
      if (error.stdout) console.error(error.stdout)
      if (error.stderr) console.error(error.stderr)
      process.exit(1)
    }
  }

  console.error(
    'No method available to run SQL.\n\n' +
    'Options:\n' +
    '  1. Install psql: brew install postgresql\n' +
    '  2. Make sure local Supabase is running: supabase start\n' +
    '  3. Set DATABASE_URL to your postgres connection string\n'
  )
  process.exit(1)
}

main()
