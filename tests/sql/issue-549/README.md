# Seeded-DB acceptance tests — issue #549

Assertions for the learning-engine correctness fixes (leagues, FSRS backfill,
practice XP, store redemption). These cover the parts of #549 that live in SQL
and therefore cannot be reached by the Vitest suites:

| Script | Covers |
|---|---|
| `test-leagues-549.sql` | §1 missed-rollover catch-up + per-week XP window · §2 cohort-scaled bands, zero-XP members parked |
| `test-fsrs-549.sql` | §4 backfill reaches lapsed cards, leaves never-reviewed and already-seeded rows alone |
| `test-practice-xp-549.sql` | §5 a 3-topic mixed session earns the same XP as a 1-topic focused one |
| `test-store-race-549.sql` | §6 sequential correctness, the freeze ceiling refusing without charging, insufficient-coins |
| `setup-race-549.sql` + `verify-race-549.sql` + `cleanup-race-549.sql` | §6 the actual concurrency race (see below) |

Every script except the race trio runs inside `BEGIN; … ROLLBACK;` and leaves the
database exactly as it found it. Each ends in a `DO $$ … $$` block that raises an
exception on failure and a `PASS:` notice on success, so a failure is loud rather
than something you have to eyeball.

## Running them

Requires a local stack (`supabase start`) with all migrations applied.

```bash
docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off \
  < tests/sql/issue-549/test-leagues-549.sql
```

The `-i` is required — without it psql gets no stdin and silently produces
nothing. Note also that psql's `\i` resolves paths *inside* the container, so
redirect from the host as above rather than using `\i`.

These use tenant `00000000-0000-0000-0000-000000000002` (Code Academy Pro), which
is on the enterprise plan and therefore passes the gamification feature gates.
Inserting into `auth.users` fires `handle_new_user()`, which already creates the
`profiles` row — hence the `ON CONFLICT` guards in the seeds.

## The concurrency race (§6)

This one cannot be a single rolled-back transaction: it needs genuinely
concurrent, committed sessions to show that `redeem_store_item()` serializes on
the profile row lock. It writes real rows, so run the cleanup afterwards.

A shell function, not a variable — `$PSQL` as a bare variable does not word-split
under zsh, which is the default shell on macOS.

```bash
psqlx() { docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off "$@"; }
USER_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0549
TENANT=00000000-0000-0000-0000-000000000002

psqlx < tests/sql/issue-549/setup-race-549.sql

# 5 concurrent purchases of double_xp_1h (price 1000, no max_per_user).
ITEM=$(psqlx -tAc "select id from gamification_store_items where slug='double_xp_1h'" | tr -d '[:space:]')
for i in 1 2 3 4 5; do
  psqlx -tAc "select redeem_store_item('$USER_ID'::uuid, '$TENANT'::uuid, '$ITEM'::uuid)" &
done
wait

psqlx < tests/sql/issue-549/verify-race-549.sql
psqlx < tests/sql/issue-549/cleanup-race-549.sql
```

Expected: all five calls return `ok: true` with *distinct* `coins_remaining`
values (4000 / 3000 / 2000 / 1000 / 0 — proof they serialized rather than raced),
`total_coins_spent` exactly 5000, and exactly 5 redemption rows. Before the fix
this was three unsynchronized read-modify-writes, so a lost update showed up as
fewer coins spent than redemptions granted.

`cleanup-race-549.sql` removes the synthetic user's redemptions, gamification
profile, profile and `auth.users` row. Run it — the shared local stack is not
yours alone.
