# Database Migrations Manual

## Overview

This project uses Supabase migrations stored in `supabase/migrations/`. Each file is a timestamped SQL script that runs in order against the database.

## Creating a New Migration

```bash
supabase migration new <descriptive_name>
# Creates: supabase/migrations/<timestamp>_<descriptive_name>.sql
```

Edit the generated file with your SQL. Always make migrations **idempotent** where possible:
- Use `IF NOT EXISTS` / `IF EXISTS` for DDL
- Use `ON CONFLICT DO NOTHING` or `DO UPDATE` for seed data
- Wrap risky operations in `DO $$ ... END $$` blocks with exception handling

## Applying Migrations

### Option 1: Supabase CLI (preferred)

```bash
supabase db push --password '<DB_PASSWORD>'
```

This connects via the Supabase connection pooler and applies all pending migrations. If it prompts for confirmation, type `Y`.

**If the CLI times out** (common on some networks where port 5432 is blocked), use Option 2.

### Option 2: Management API (fallback)

When the CLI can't connect, push migrations via the Supabase Management API:

```bash
# 1. Get your access token (stored in macOS keychain by the CLI)
security find-generic-password -l "supabase" -w | base64 -d

# 2. Apply a migration
TOKEN="<your_access_token>"
PROJECT="tcqqnjfwmbfwcyhafbbt"

node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/<MIGRATION_FILE>.sql', 'utf8');
const fullSql = sql + \"\nINSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('<VERSION>', '<NAME>');\";
process.stdout.write(JSON.stringify({query: fullSql}));
" | curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @-
```

Where:
- `<MIGRATION_FILE>` — full filename (e.g. `20260405215804_fix_missing_profile_trigger.sql`)
- `<VERSION>` — the timestamp prefix (e.g. `20260405215804`)
- `<NAME>` — the descriptive name (e.g. `fix_missing_profile_trigger`)

**Important:** Always append the `INSERT INTO supabase_migrations.schema_migrations` statement so the CLI knows the migration was applied.

### Option 3: Supabase Dashboard

1. Go to **SQL Editor** in the Supabase dashboard
2. Paste the migration SQL
3. Run it
4. Then run the migration record insert separately:
   ```sql
   INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('<VERSION>', '<NAME>');
   ```

## Checking Migration Status

### What's applied remotely?

```bash
# Via CLI
supabase db remote list --password '<DB_PASSWORD>'

# Via Management API
TOKEN="<your_access_token>"
PROJECT="tcqqnjfwmbfwcyhafbbt"

node -e "
process.stdout.write(JSON.stringify({query: 'SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;'}));
" | curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @-
```

### What's pending locally?

Compare local files against remote records:

```bash
# Local migration versions
ls supabase/migrations/*.sql | sed 's|.*/||' | sed 's/_.*//'

# Remote versions (use one of the methods above)
```

Any local version not in the remote list needs to be applied.

## Running the Production Seed

The minimal production seed creates platform plans, default tenant, admin user, gamification data, and course categories:

```bash
# Via Management API
node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/seed-prod.sql', 'utf8');
process.stdout.write(JSON.stringify({query: sql}));
" | curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @-
```

**Warning:** `seed-prod.sql` starts by truncating ALL tables including `auth.users`. Only run this on a fresh or expendable database.

After seeding, log in with: `owner@e2etest.com` / `password123`

## Troubleshooting

### CLI connection timeout

The Supabase CLI connects via the connection pooler on port 5432. If your network blocks this port, you'll see:

```
failed to connect to postgres: tls error (read tcp ... i/o timeout)
```

**Fix:** Use the Management API method (Option 2 above).

### FK constraint violations

If a migration adding a foreign key fails with `violates foreign key constraint`, there's orphan data. Fix it before retrying:

```sql
-- Find orphans (example: courses.author_id → profiles.id)
SELECT c.course_id, c.author_id
FROM courses c
LEFT JOIN profiles p ON p.id = c.author_id
WHERE p.id IS NULL;

-- Option A: Create missing profiles
INSERT INTO profiles (id, full_name, avatar_url)
SELECT u.id, u.raw_user_meta_data->>'full_name', ''
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Option B: Delete orphan rows
DELETE FROM courses WHERE author_id NOT IN (SELECT id FROM profiles);
```

### Migration version mismatch

If the remote `schema_migrations` table has different version numbers than local filenames (e.g. migrations were applied via dashboard with auto-generated timestamps):

```sql
-- Update the remote record to match the local filename
UPDATE supabase_migrations.schema_migrations
SET version = '<LOCAL_VERSION>'
WHERE version = '<REMOTE_VERSION>' AND name = '<NAME>';
```

### Prepared statement errors (port 6543)

If you try the session pooler (port 6543) and get `prepared statement already exists`, use port 5432 or the Management API instead. The session pooler doesn't work well with the Supabase CLI's connection handling.

## Project Details

| Key | Value |
|-----|-------|
| Project ref | `tcqqnjfwmbfwcyhafbbt` |
| Region | US East 1 |
| Pooler host | `aws-0-us-east-1.pooler.supabase.com` |
| Direct host | `db.tcqqnjfwmbfwcyhafbbt.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/tcqqnjfwmbfwcyhafbbt |
