import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres.tcqqnjfwmbfwcyhafbbt:R808Z4QSPxGet1mC@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

await client.connect();
const { rows } = await client.query('SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version');
console.log(`Total applied: ${rows.length}`);
console.log('Last 10:');
rows.slice(-10).forEach(r => console.log(' ', r.version, r.name || ''));
await client.end();
