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

### The rule: cloud changes go through `supabase db push`

**Never apply a migration to cloud with the MCP `apply_migration` tool, the SQL
editor, or a raw Management API call unless you also stamp it with the version
from its filename.** This is not style preference — it is what keeps drift
detectable.

`supabase_migrations.schema_migrations` is the only record of what cloud has
run. `supabase db push` stamps each migration with **the timestamp from its
filename**. Every ad-hoc path stamps a **fresh** timestamp instead. Once the
ledger holds a stamp that matches no file in `supabase/migrations/`, the
question "what is missing from cloud?" stops having a usable answer: the
re-stamped migrations show up as *pending* (false positives), and a genuinely
missing migration is indistinguishable from them.

That is not hypothetical. It is how issue #541 happened:

| Repo file | Cloud stamp before #541 |
|---|---|
| `20260721120000_add_binance_personal_provider` | `20260725213441` |
| `20260725110000_transaction_split_snapshot_backstop` | `20260725213508` |
| `20260725160000_entitlement_gated_enrollment_inserts` | `20260725213610` |
| `20260725170000_transactions_column_hardening` | `20260725192946` |
| `20260725180000_transactions_insert_lockdown` | **never applied** |

Four migrations were applied through `apply_migration` and re-stamped. The
fifth — the `transactions` INSERT lockdown from #538, a `severity:critical`
payments fix — was never applied at all, and hid among the four false
positives for a day. Diffing the repo against the ledger reported all five as
pending, so the real gap looked like more of the same noise.

If you do have to apply SQL out of band, **immediately** repair the stamp:

```bash
# Preferred — the CLI's purpose-built command for this
supabase migration repair --status applied <VERSION_FROM_FILENAME>
supabase migration repair --status reverted <WRONG_FRESH_STAMP>
```

Then run `npm run verify:cloud` (below) and confirm it is clean before moving on.

### Verifying cloud matches this repo

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npm run verify:cloud
```

Queries the **live** database and exits non-zero on drift. It asserts both
halves of the problem above:

- **Ledger integrity** — every repo migration is stamped on cloud under its own
  filename, and cloud carries no stamp that matches no file.
- **Payment invariants** (#512 / #528 / #538) — `authenticated` and `anon` hold
  no INSERT on `transactions`, no column-level INSERT grant survives,
  `service_role` still has INSERT, the `authenticated` UPDATE grant is exactly
  `(status, provider_subscription_id, stripe_payment_intent_id)`, the INSERT
  policy pins `status` plus all four `settlement_*` columns to NULL, and both
  `before_transaction_split_snapshot_*` triggers exist and are enabled.

It reads catalog state, not migration text, so it also catches a *later*
migration re-widening something — including a schema dump re-applying the
original `GRANT ALL ON TABLE transactions TO authenticated`.

**Run it from `master`, after merging.** The two ledger checks compare cloud
against the migrations in your *current checkout*. On a feature branch, any
migration another in-flight branch has already applied to cloud shows up as an
orphan, and any migration on your branch not yet applied shows up as pending —
neither is real drift. The payment-invariant checks are branch-independent and
meaningful anywhere.

The token is a [personal access token](https://supabase.com/dashboard/account/tokens).
It uses the Management API over HTTPS rather than a Postgres connection because
port 5432 is blocked on some networks this project is developed from — the same
reason Option 2 below exists.

> Unit tests cannot do this job. `tests/unit/verify-cloud-schema.test.ts` and
> `tests/unit/transaction-split-snapshot-backstop.test.ts` prove the *rules* are
> right; neither opens a database connection. A green `npm run test:unit` says
> nothing about whether a migration was ever applied. Only `verify:cloud` does.

### Option 1: Supabase CLI (preferred)

```bash
supabase db push --password '<DB_PASSWORD>'
```

This connects via the Supabase connection pooler and applies all pending migrations. If it prompts for confirmation, type `Y`.

**If the CLI times out** (common on some networks where port 5432 is blocked), use Option 2.

### Option 2: Management API (fallback)

When the CLI can't connect, push migrations via the Supabase Management API.
**This is the path that creates drift** — the `INSERT INTO schema_migrations`
line below is not optional bookkeeping, it is the entire reason this fallback is
safe to use:

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

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npm run verify:cloud
```

Use this rather than eyeballing a diff. The manual comparison —

```bash
ls supabase/migrations/*.sql | sed 's|.*/||' | sed 's/_.*//'
```

— is only trustworthy when the ledger is clean. If any migration was ever
applied out of band, a local version missing from the remote list means *either*
"never applied" *or* "applied under a different stamp", and nothing in the diff
tells you which. `verify:cloud` reports the two cases separately (`not on cloud`
vs `orphan stamps`) and additionally checks that the payment invariants actually
hold, which no filename comparison can do.

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

If the remote `schema_migrations` table has different version numbers than local filenames (e.g. migrations were applied via dashboard or `apply_migration` with auto-generated timestamps), prefer the CLI's purpose-built command:

```bash
supabase migration repair --status applied   <LOCAL_VERSION>
supabase migration repair --status reverted  <REMOTE_VERSION>
```

If the CLI cannot reach the pooler, the equivalent write is:

```sql
-- Re-stamp the remote record to match the local filename.
-- Verify FIRST that the DDL really is live (query the grants/policies/triggers
-- it created) — this only repairs the ledger, it does not apply anything.
UPDATE supabase_migrations.schema_migrations
SET version = '<LOCAL_VERSION>'
WHERE version = '<REMOTE_VERSION>' AND name = '<NAME>';
```

Confirm with `npm run verify:cloud` afterwards.

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
